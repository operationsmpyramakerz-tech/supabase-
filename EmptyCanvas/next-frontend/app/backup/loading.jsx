export default function BackupLoading() {
  return (
    <main className="next-backup-loading" aria-label="Loading Database Backup">
      <div className="next-backup-loading__hero" />
      <div className="next-backup-loading__summary">
        <span /><span /><span /><span />
      </div>
      <div className="next-backup-loading__toolbar" />
      <div className="next-backup-loading__grid">
        {Array.from({ length: 8 }).map((_, index) => <span key={index} />)}
      </div>
    </main>
  );
}
