import "./home-refresh-loading.css";
// Route styles are intentionally hoisted from a server layout so both the
// streamed Home loading state and the resolved page use the same CSS, without
// waiting for a child client AppShell to mount first.
export default function HomeLayout({ children }) {
  return (
    <>
      <link rel="stylesheet" href="/next/css/home-performance.css?v=boot-main51-v1" precedence="erp-performance" />
      <link rel="stylesheet" href="/next/css/home.css?v=boot-main51-v1" precedence="erp-detail" />
      <link rel="stylesheet" href="/next/css/home-dashboard-v2.css?v=boot-main51-v1" precedence="erp-detail" />
      <link rel="stylesheet" href="/next/css/home-motion-v1.css?v=home-motion-v2" precedence="erp-detail" />
      <link rel="stylesheet" href="/next/css/home-orders-analysis-navigation-v1.css?v=home-orders-drilldown-v1" precedence="erp-detail" />
      <link rel="stylesheet" href="/next/css/home-preparing-analysis-v1.css?v=home-preparing-v1" precedence="erp-detail" />
      {children}
    </>
  );
}
