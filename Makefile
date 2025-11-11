.PHONY: help install format lint type-check test test-cov clean pre-commit check mcp-server build up down

help:
	@echo "Available commands:"
	@echo "  make install       - Install dependencies"
	@echo "  make build         - Build TypeScript"
	@echo "  make format        - Format code with Prettier"
	@echo "  make lint          - Lint code with ESLint"
	@echo "  make type-check    - Type check with TypeScript"
	@echo "  make test          - Run tests"
	@echo "  make test-cov      - Run tests with coverage report"
	@echo "  make mcp-server    - Build and run MCP server"
	@echo "  make up            - Start Docker services (detached)"
	@echo "  make down          - Stop Docker services and remove volumes"
	@echo "  make clean         - Clean temporary files"
	@echo "  make pre-commit    - Install pre-commit hooks"
	@echo "  make check         - Run all checks (format, lint, type-check, test)"

install:
	yarn install

format:
	@echo "Formatting with Prettier..."
	yarn format

lint:
	@echo "Linting with ESLint..."
	yarn lint

type-check:
	@echo "Type checking with TypeScript..."
	yarn type-check

test:
	@echo "Running tests..."
	yarn test

test-cov:
	@echo "Running tests with coverage..."
	yarn test:coverage
	@echo "Coverage report generated in coverage/"

build:
	@echo "Building TypeScript..."
	yarn build
	@echo "Build complete!"

mcp-server: build
	@echo "Starting MCP server..."
	@echo "Note: MCP server runs on stdio. Configure in .cursor/mcp.json"
	node dist/src/server/mcp-server.js

up:
	@echo "Starting Docker services..."
	docker compose up -d
	@echo "Docker services started in detached mode"

down:
	@echo "Stopping Docker services and removing volumes..."
	docker compose down -v
	@echo "Docker services stopped"

clean:
	@echo "Cleaning temporary files..."
	rm -rf dist coverage node_modules/.cache .tsbuildinfo

pre-commit:
	@echo "Installing pre-commit hooks..."
	pre-commit install
	@echo "Pre-commit hooks installed. Run 'pre-commit run --all-files' to test."

check: format lint type-check test
	@echo "All checks passed!"
