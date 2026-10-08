#!/usr/bin/env python3
"""
Generates backend/prisma/migrations/<ts>_init/migration.sql from backend/prisma/schema.prisma
following Prisma's PostgreSQL naming conventions (<Model>_pkey, <Model>_<cols>_key/_idx/_fkey).

Normally you would run `npx prisma migrate dev --name init`. This script exists so the repository
ships a ready migration that can be applied with `npx prisma migrate deploy`. If you change
schema.prisma later, create new migrations with `npx prisma migrate dev` as usual.
"""
import re, sys, pathlib

root = pathlib.Path(__file__).resolve().parents[2]
schema = (root / "backend/prisma/schema.prisma").read_text()
out_path = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else root / "backend/prisma/migrations/20261007000000_init/migration.sql"

schema = re.sub(r"//[^\n]*", "", schema)
enums = {m.group(1): re.findall(r"^\s*([A-Z0-9_]+)\s*$", m.group(2), re.M) for m in re.finditer(r"enum\s+(\w+)\s*\{([^}]*)\}", schema)}
models = {}
for m in re.finditer(r"model\s+(\w+)\s*\{(.*?)\n\}", schema, re.S):
    models[m.group(1)] = m.group(2)

SCALAR = {"String": "TEXT", "Int": "INTEGER", "Boolean": "BOOLEAN", "DateTime": "TIMESTAMP(3)", "Json": "JSONB", "Decimal": "DECIMAL(65,30)", "BigInt": "BIGINT", "Float": "DOUBLE PRECISION"}

def parse_list(s): return [x.strip() for x in s.split(",") if x.strip()]

sql, indexes, fks = [], [], []
for name, body in models.items():
    cols, pk, uniques = [], None, []
    for raw in body.strip().splitlines():
        line = raw.strip()
        if not line: continue
        if line.startswith("@@"):
            if line.startswith("@@id"):
                pk = parse_list(re.search(r"\[(.*?)\]", line).group(1))
            elif line.startswith("@@unique"):
                c = parse_list(re.search(r"\[(.*?)\]", line).group(1))
                indexes.append(f'CREATE UNIQUE INDEX "{name}_{"_".join(c)}_key" ON "{name}"({", ".join(chr(34)+x+chr(34) for x in c)});')
            elif line.startswith("@@index"):
                c = parse_list(re.search(r"\[(.*?)\]", line).group(1))
                indexes.append(f'CREATE INDEX "{name}_{"_".join(c)}_idx" ON "{name}"({", ".join(chr(34)+x+chr(34) for x in c)});')
            continue
        m = re.match(r"(\w+)\s+(\w+)(\?|\[\])?\s*(.*)$", line)
        if not m: continue
        fname, ftype, mod, attrs = m.groups()
        optional = mod == "?"
        if mod == "[]": continue
        if ftype in models:  # relation field
            rel = re.search(r"@relation\(([^)]*)\)", attrs)
            if rel and "fields:" in rel.group(1):
                f = parse_list(re.search(r"fields:\s*\[(.*?)\]", rel.group(1)).group(1))
                r = parse_list(re.search(r"references:\s*\[(.*?)\]", rel.group(1)).group(1))
                od = re.search(r"onDelete:\s*(\w+)", rel.group(1))
                rule = {"Cascade": "CASCADE", "Restrict": "RESTRICT", "SetNull": "SET NULL"}[od.group(1)] if od else ("SET NULL" if optional else "RESTRICT")
                fks.append(f'ALTER TABLE "{name}" ADD CONSTRAINT "{name}_{"_".join(f)}_fkey" FOREIGN KEY ({", ".join(chr(34)+x+chr(34) for x in f)}) REFERENCES "{ftype}"({", ".join(chr(34)+x+chr(34) for x in r)}) ON DELETE {rule} ON UPDATE CASCADE;')
            continue
        if ftype in enums: sqltype = f'"{ftype}"'
        else:
            sqltype = SCALAR[ftype]
            db = re.search(r"@db\.(\w+)(?:\(([^)]*)\))?", attrs)
            if db:
                if db.group(1) == "Date": sqltype = "DATE"
                elif db.group(1) == "Decimal": sqltype = f"DECIMAL({db.group(2).replace(' ', '')})"
        default = ""
        d = re.search(r"@default\((.*?)\)(?:\s|$)", attrs + " ")
        if d:
            v = d.group(1)
            if v == "now()": default = " DEFAULT CURRENT_TIMESTAMP"
            elif v in ("uuid()", "cuid()", "autoincrement()"): default = ""
            elif v in ("true", "false"): default = f" DEFAULT {v}"
            elif re.fullmatch(r"-?\d+", v): default = f" DEFAULT {v}"
            elif ftype in enums: default = f" DEFAULT '{v}'"
            else: default = f" DEFAULT {v}"
        cols.append(f'    "{fname}" {sqltype}{"" if optional else " NOT NULL"}{default}')
        if "@id" in attrs and "@@id" not in attrs: pk = [fname]
        if re.search(r"@unique\b", attrs): indexes.append(f'CREATE UNIQUE INDEX "{name}_{fname}_key" ON "{name}"("{fname}");')
    pkc = f',\n    CONSTRAINT "{name}_pkey" PRIMARY KEY ({", ".join(chr(34)+x+chr(34) for x in pk)})' if pk else ""
    sql.append(f'-- CreateTable\nCREATE TABLE "{name}" (\n' + ",\n".join(cols) + pkc + "\n);")

parts = ["-- Generated from schema.prisma by database/tools/generate_init_migration.py\n"]
for e, vals in enums.items(): parts.append(f'-- CreateEnum\nCREATE TYPE "{e}" AS ENUM ({", ".join(repr(v) for v in vals)});')
parts += sql
parts.append("-- CreateIndex\n" + "\n".join(indexes))
parts.append("-- AddForeignKey\n" + "\n".join(fks))
out_path.parent.mkdir(parents=True, exist_ok=True)
out_path.write_text("\n\n".join(parts) + "\n")
print(f"wrote {out_path}: {len(enums)} enums, {len(models)} tables, {len(indexes)} indexes, {len(fks)} foreign keys")
