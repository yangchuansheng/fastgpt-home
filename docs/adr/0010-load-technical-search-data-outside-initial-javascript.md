# Load technical search data outside initial JavaScript

The complete technical registry remains available to build-time and server-side consumers that require it; initial client JavaScript carries a bounded payload independent of that registry. The initial response renders a useful bounded listing, and client search loads a separate public projection containing only fields required for discovery; projection failure preserves that listing. Initial JavaScript growth is constrained by a reproducible baseline-relative budget.
