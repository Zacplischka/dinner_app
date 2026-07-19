# Contracts Evolve Additively Across Deployments

The frontend and backend deploy independently, so a single commit is not an atomic release. Contract changes are additive by default; a breaking change is shipped in two deployments—first the backend accepts old and new shapes, then the frontend switches—before obsolete support is removed. Dinder does not add API versioning until it has independent consumers that require it.
