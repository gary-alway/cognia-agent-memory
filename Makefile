.PHONY: help up down clean clean-db clean-s3 pre-commit

help:
	@echo "Available commands:"
	@echo ""
	@echo "Docker:"
	@echo "  make up            - Start Docker services (detached)"
	@echo "  make down          - Stop Docker services and remove volumes"
	@echo ""
	@echo "Cleanup:"
	@echo "  make clean         - Clean temporary files"
	@echo "  make clean-db      - Clean test data from Neo4j database"
	@echo "  make clean-s3      - Clean all archived sessions from S3 (⚠️ destructive)"
	@echo ""
	@echo "Dev Workflow:"
	@echo "  make pre-commit    - Run full verification before commit (kills MCP, runs all checks)"
	@echo ""

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

clean-db:
	@echo "Cleaning test data from database..."
	yarn cleanup-db

clean-s3:
	yarn clean-s3

pre-commit:
	@echo "Running full pre-commit verification..."
	@bash scripts/pre-commit.sh
	@echo "Verification complete! Ready to commit."
