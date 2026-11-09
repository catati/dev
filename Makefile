.PHONY: help install test e2e lint verify

help:
	@echo "catati/dev make targets:"
	@echo "  make install  Install the locked dependencies (npm ci)"
	@echo "  make test     Run the tests (npm test)"
	@echo "  make e2e      Run the e2e tests (none in this repo)"
	@echo "  make lint     Run the linters (none in this repo)"
	@echo "  make verify   Run the gate CI runs: test, lint, catati check"
	@echo "  make help     List these targets"

install:
	npm ci

test:
	npm test

e2e:
	@echo "e2e: no e2e layer in this repo"

lint:
	@echo "lint: no lint tooling in this repo"

verify: test lint
	node bin/catati.mjs check
