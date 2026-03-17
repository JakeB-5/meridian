import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Layout, PageContainer, PageHeader } from './layout.js';

describe('Layout', () => {
  it('renders children as main content', () => {
    render(<Layout>Content here</Layout>);
    expect(screen.getByText('Content here')).toBeInTheDocument();
  });

  it('renders sidebar slot', () => {
    render(<Layout sidebar={<div>Sidebar</div>}>Content</Layout>);
    expect(screen.getByText('Sidebar')).toBeInTheDocument();
  });

  it('renders header slot', () => {
    render(<Layout header={<div>Header</div>}>Content</Layout>);
    expect(screen.getByText('Header')).toBeInTheDocument();
  });

  it('renders all slots together', () => {
    render(
      <Layout sidebar={<div>Sidebar</div>} header={<div>Header</div>}>
        Main Content
      </Layout>,
    );
    expect(screen.getByText('Sidebar')).toBeInTheDocument();
    expect(screen.getByText('Header')).toBeInTheDocument();
    expect(screen.getByText('Main Content')).toBeInTheDocument();
  });
});

describe('PageContainer', () => {
  it('renders children', () => {
    render(<PageContainer>Page content</PageContainer>);
    expect(screen.getByText('Page content')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    const { container } = render(
      <PageContainer className="custom">Content</PageContainer>,
    );
    expect(container.firstChild).toHaveClass('custom');
  });
});

describe('PageHeader', () => {
  it('renders title', () => {
    render(<PageHeader title="Page Title" />);
    expect(screen.getByText('Page Title')).toBeInTheDocument();
  });

  it('renders description', () => {
    render(<PageHeader title="Title" description="Page description" />);
    expect(screen.getByText('Page description')).toBeInTheDocument();
  });

  it('renders actions', () => {
    render(
      <PageHeader title="Title" actions={<button>Create</button>} />,
    );
    expect(screen.getByRole('button', { name: 'Create' })).toBeInTheDocument();
  });

  it('renders breadcrumb', () => {
    render(
      <PageHeader title="Title" breadcrumb={<div>Home / Page</div>} />,
    );
    expect(screen.getByText('Home / Page')).toBeInTheDocument();
  });
});
