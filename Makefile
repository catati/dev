.PHONY: help install test e2e lint format staged-check verify

help:
	@echo "catati/dev make targets:"
	@echo "  make install       Install the locked dependencies (npm ci)"
	@echo "  make test          Run the tests (npm test)"
	@echo "  make e2e           Run the e2e tests (none in this repo)"
	@echo "  make lint          Run the linters (none in this repo)"
	@echo "  make format        Format the code (no formatter in this repo)"
	@echo "  make staged-check  Check the staged files (no staged checks in this repo)"
	@echo "  make verify        Run the gate CI runs: test, lint, catati check"
	@echo "  make help          List these targets"

install:
	npm ci

test:
	npm test

e2e:
	@echo "e2e: no e2e layer in this repo"

lint:
	@echo "lint: no lint tooling in this repo"

format:
	@echo "format: no formatter in this repo"

staged-check:
	@echo "staged-check: no staged checks in this repo"

verify: test lint
	node bin/catati.mjs check
