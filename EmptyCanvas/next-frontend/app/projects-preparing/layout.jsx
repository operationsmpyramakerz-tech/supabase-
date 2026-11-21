// Route-local cinematic motion. Leave the shared header, sidebar, and dock untouched.
// Loading and resolved page receive styles from the same Next.js route boundary.
export default function ProjectsPreparingMotionLayout({ children }) {
  return (
    <>
      <link rel="stylesheet" href="/next/css/projects-preparing-motion-v1.css?v=cinematic-step4-v1" precedence="erp-detail" />
      {children}
    </>
  );
}
