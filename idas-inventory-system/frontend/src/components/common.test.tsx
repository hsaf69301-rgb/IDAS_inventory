import { render, screen } from '@testing-library/react';
import { DataTable, EmptyState, ErrorState, StatusBadge } from './common';

describe('shared components', () => {
  it('StatusBadge humanises enum values', () => {
    render(<StatusBadge value="UNDER_MAINTENANCE" />);
    expect(screen.getByText('Under maintenance')).toBeInTheDocument();
  });
  it('DataTable shows an empty state when there are no rows', () => {
    render(<DataTable rows={[]} columns={[{ key: 'a', header: 'A' }]} empty={<EmptyState title="Nothing here yet" />} />);
    expect(screen.getByText('Nothing here yet')).toBeInTheDocument();
  });
  it('DataTable renders rows and pagination', () => {
    render(<DataTable rows={[{ id: '1', a: 'Hello' }]} columns={[{ key: 'a', header: 'A' }]} page={1} pageSize={10} total={25} onPage={() => undefined} />);
    expect(screen.getByText('Hello')).toBeInTheDocument();
    expect(screen.getByText('Page 1 of 3')).toBeInTheDocument();
  });
  it('ErrorState announces errors', () => {
    render(<ErrorState error={new Error('boom')} />);
    expect(screen.getByRole('alert')).toHaveTextContent('boom');
  });
});
