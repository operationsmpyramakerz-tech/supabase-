export default function TaskManagementLoading() {
  return (
    <main className="standalone-state next-task-loading-page">
      <section className="state-card next-task-loading-card">
        <span className="status-dot" />
        <h1>Loading Task Management</h1>
        <p>Preparing projects, workflow blocks, filters, and your task agenda.</p>
        <div className="next-task-loading-grid" aria-hidden="true">
          {Array.from({ length: 6 }, (_, index) => <span key={index} />)}
        </div>
      </section>
    </main>
  );
}
