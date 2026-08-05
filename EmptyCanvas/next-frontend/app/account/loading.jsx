export default function AccountLoading() {
  return (
    <main className="next-account-loading" aria-label="Loading account">
      <div className="next-account-loading__cover" />
      <div className="next-account-loading__identity"><span /><div /></div>
      <div className="next-account-loading__grid">
        {Array.from({ length: 6 }, (_, index) => <span key={index} />)}
      </div>
      <div className="next-account-loading__panel" />
    </main>
  );
}
