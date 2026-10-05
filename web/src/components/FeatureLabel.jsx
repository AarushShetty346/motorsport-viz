// Small grey caption naming the course feature behind a piece of UI, e.g.
// "Aggregation: $group + $lookup (Mongo)" or "Head-to-head comparison (User)".
export default function FeatureLabel({ name, type = 'mongo', className = '' }) {
  return <p className={`feature-label ${className}`}>{name} ({type === 'user' ? 'User' : 'Mongo'})</p>;
}
