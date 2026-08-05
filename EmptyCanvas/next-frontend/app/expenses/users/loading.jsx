export default function ExpensesUsersLoading() {
  return (
    <section className="next-expense-users-loading" aria-label="Loading Expenses Users">
      <div className="next-expense-users-loading__hero" />
      <div className="next-expense-users-loading__stats">
        {Array.from({ length: 4 }, (_, index) => <div key={index} />)}
      </div>
      <div className="next-expense-users-loading__toolbar" />
      <div className="next-expense-users-loading__grid">
        {Array.from({ length: 6 }, (_, index) => <div key={index} />)}
      </div>
    </section>
  );
}
