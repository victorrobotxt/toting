# Reusable SnarkJS pipeline
.PHONY: circuits

circuits:
	@python scripts/build_manifest.py
	@python scripts/check_manifest.py
