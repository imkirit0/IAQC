import Link from "next/link";

export default function NotFound() {
  return (
    <div className="content" style={{ maxWidth: 560, paddingTop: 96 }}>
      <div className="code">ERROR 404</div>
      <h1 style={{ margin: "8px 0 12px" }}>This page isn&apos;t available</h1>
      <p className="muted">It may not exist, or your role may not have access to it.</p>
      <Link className="btn primary" href="/" style={{ marginTop: 16 }}>Go to my home page</Link>
    </div>
  );
}
