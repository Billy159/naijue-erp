# API boundary

Fastify is pinned as the intended ordinary HTTP adapter, not replaced with a home-grown framework. There is deliberately no listening server, login endpoint, production policy wiring, or business route in this first foundation. The application service is exercised directly through an explicit transaction port using synthetic tests.

Before enabling routes: freeze the exact input/sign/money contracts from the real Demo, implement authenticated server-side permissions/reference checks and request schemas, and implement/verify the PostgreSQL transaction adapter. Never accept stock effects or trust actor identity directly from an HTTP request.
