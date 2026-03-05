SHELL := /bin/bash

install:
	# copy local relative dependencies (required by local npmdata package)
	mkdir -p ../lib/dist
	cp -R ../../lib/dist/npmdata-0.0.1.tgz ../lib/dist/

	pnpm add example-files-package@file:../dist/example-files-package-1.0.0.tgz
	pnpm add npmdata@file:../lib/dist/npmdata-0.0.1.tgz
	pnpm install --no-frozen-lockfile

test:
	make clean
	make install

	# --- Test 1: config from package.json "npmdata" key ---
	# extract without --packages: reads entries from the "npmdata" key in package.json
	pnpm exec npmdata extract
	test -e output/docs/README.md
	test -e output/docs/adrs/adr-001-sample1.md
	test -e output/data/users-dataset/user1.json

	# check without --packages: reads entries from package.json
	pnpm exec npmdata check

	# purge without --packages: reads entries from package.json
	pnpm exec npmdata purge
	test ! -e output/docs/README.md
	test ! -e output/data/users-dataset/user1.json

	# --- Test 2: config from .npmdatarc ---
	# temporarily move the "npmdata" field out of package.json and write .npmdatarc
	jq '.npmdata' package.json > .npmdatarc
	jq 'del(.npmdata)' package.json > package.json.tmp && mv package.json.tmp package.json

	pnpm exec npmdata extract
	test -e output/docs/README.md
	test -e output/data/users-dataset/user1.json

	pnpm exec npmdata check
	pnpm exec npmdata purge
	test ! -e output/docs/README.md

	# restore original package.json
	jq --slurpfile npmdata .npmdatarc '. + {npmdata: $$npmdata[0]}' package.json > package.json.tmp && mv package.json.tmp package.json
	rm .npmdatarc

	echo "All config-file mode tests passed"

clean:
	@rm -rf node_modules
	@rm -rf output
	@rm -f pnpm-lock.yaml
	@rm -f .npmdatarc
	@git checkout package.json 2>/dev/null || true
