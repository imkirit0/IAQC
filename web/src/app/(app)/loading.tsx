// Skeleton shown while a page's server data loads.
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <div className="skel" style={{ height: 38, width: 280, marginBottom: 12 }} />
      <div className="skel" style={{ height: 16, width: 360, marginBottom: 30 }} />
      <div className="skel" style={{ height: 88, marginBottom: 22 }} />
      <div className="skel" style={{ height: 420 }} />
    </div>
  );
}
