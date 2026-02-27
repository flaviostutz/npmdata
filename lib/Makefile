SHELL := /bin/bash

build: install
	@rm -rf dist

	@# Don't bundle so internal constructs continue working on clients
	pnpm exec tsc --outDir dist

	@# remove all tests from distribution
	@-find ./dist \( -regex '.*\.test\..*' -o -regex '.*__tests.*' \) -exec rm -rf {} \; 2> /dev/null

	@# Create pack to be used by examples app to simulate real usage of the lib
	pnpm pack --pack-destination dist

lint:
	pnpm exec eslint ./src --ext .ts
	# FIXME
# 	pnpm audit --audit-level high

lint-fix:
	pnpm exec eslint . --ext .ts --fix

test-watch:
	pnpm exec jest -i --watch

test:
	@# can't be in parallel because we use nock that has shared contexts
	pnpm exec jest -i --verbose

clean:
	rm -rf node_modules
	rm -rf dist

all: build lint test

install:
	# corepack enable
# 	# To circunvent https://github.com/nodejs/corepack/issues/612
# 	corepack enable pnpm
# 	corepack use pnpm@8.9.0
# 	COREPACK_INTEGRITY_KEYS=0 pnpm --version

	pnpm install --frozen-lockfile --config.dedupe-peer-dependents=false

publish:
	npx -y monotag@1.26.0 current --bump-action=latest --prefix=
	@VERSION=$$(node -p "require('./package.json').version"); \
	if echo "$$VERSION" | grep -q '-'; then \
		TAG=$$(echo "$$VERSION" | sed 's/[0-9]*\.[0-9]*\.[0-9]*-\([a-zA-Z][a-zA-Z0-9]*\).*/\1/'); \
		echo "Prerelease version $$VERSION detected, publishing with --tag $$TAG to avoid it being 'latest'"; \
		npm publish --no-git-checks --provenance --tag "$$TAG"; \
	else \
		npm publish --no-git-checks --provenance; \
	fi
