# Makefile for ZK Circuits Build System
# Railgun-style privacy circuits for Solana (BN254, Groth16)

SHELL := /bin/bash
CIRCOM := circom
SNARKJS := npx snarkjs
RAPIDSNARK := rapidsnark

# Directories
SRC_DIR := src
BUILD_DIR := build
POT_DIR := pot
TEST_VECTORS_DIR := test_vectors
SCRIPTS_DIR := scripts
EXPORT_DIR := solana_export

# Circuits
CIRCUITS := shield transfer unshield

# Powers of Tau parameters
PTAU_POWER := 14
PTAU_FILE := $(POT_DIR)/pot$(PTAU_POWER)_final.ptau

# Colors for output
GREEN := \033[0;32m
YELLOW := \033[0;33m
BLUE := \033[0;34m
NC := \033[0m # No Color

.PHONY: all ptau compile setup prove-shield prove-transfer prove-unshield prove-all prove-all-fast clean test-vectors test-vectors-enhanced test-negative export-vk help

# Default target
all: ptau compile setup
	@echo "$(GREEN)✅ All circuits compiled and setup complete!$(NC)"

help:
	@echo "$(BLUE)ZK Circuits Build System$(NC)"
	@echo ""
	@echo "Available targets:"
	@echo "  $(YELLOW)ptau$(NC)                    - Generate Powers of Tau (run once)"
	@echo "  $(YELLOW)compile$(NC)                 - Compile all circuits"
	@echo "  $(YELLOW)setup$(NC)                   - Setup proving/verification keys"
	@echo "  $(YELLOW)test-vectors$(NC)            - Generate basic test vectors"
	@echo "  $(YELLOW)test-vectors-enhanced$(NC)   - Generate enhanced test vectors (with negative cases)"
	@echo "  $(YELLOW)prove-shield$(NC)            - Generate and verify shield proof (snarkjs)"
	@echo "  $(YELLOW)prove-transfer$(NC)          - Generate and verify transfer proof (snarkjs)"
	@echo "  $(YELLOW)prove-unshield$(NC)          - Generate and verify unshield proof (snarkjs)"
	@echo "  $(YELLOW)prove-all$(NC)               - Generate and verify all proofs (snarkjs)"
	@echo "  $(YELLOW)prove-shield-fast$(NC)       - Generate shield proof using rapidsnark"
	@echo "  $(YELLOW)prove-transfer-fast$(NC)     - Generate transfer proof using rapidsnark"
	@echo "  $(YELLOW)prove-unshield-fast$(NC)     - Generate unshield proof using rapidsnark"
	@echo "  $(YELLOW)prove-all-fast$(NC)          - Generate all proofs using rapidsnark"
	@echo "  $(YELLOW)test-negative$(NC)           - Run negative test suite (security validation)"
	@echo "  $(YELLOW)export-vk$(NC)               - Export verification keys for Solana"
	@echo "  $(YELLOW)clean$(NC)                   - Remove build artifacts (keep pot)"
	@echo "  $(YELLOW)clean-all$(NC)               - Remove everything including pot"
	@echo ""

# ========== Powers of Tau ==========
ptau: $(PTAU_FILE)

$(PTAU_FILE):
	@echo "$(BLUE)🔧 Generating Powers of Tau (power=$(PTAU_POWER))...$(NC)"
	@mkdir -p $(POT_DIR)
	@echo "$(YELLOW)  → Creating new Powers of Tau...$(NC)"
	@$(SNARKJS) powersoftau new bn128 $(PTAU_POWER) $(POT_DIR)/pot$(PTAU_POWER)_0000.ptau -v
	@echo "$(YELLOW)  → Contributing to ceremony...$(NC)"
	@$(SNARKJS) powersoftau contribute $(POT_DIR)/pot$(PTAU_POWER)_0000.ptau $(POT_DIR)/pot$(PTAU_POWER)_0001.ptau \
		--name="dev contribution" -e="dev entropy" -v
	@echo "$(YELLOW)  → Preparing phase 2...$(NC)"
	@$(SNARKJS) powersoftau prepare phase2 $(POT_DIR)/pot$(PTAU_POWER)_0001.ptau $(PTAU_FILE) -v
	@rm -f $(POT_DIR)/pot$(PTAU_POWER)_0000.ptau $(POT_DIR)/pot$(PTAU_POWER)_0001.ptau
	@echo "$(GREEN)✅ Powers of Tau ready: $(PTAU_FILE)$(NC)"

# ========== Compile Circuits ==========
compile:
	@for circuit in $(CIRCUITS); do \
		$(MAKE) -s compile-circuit CIRCUIT=$$circuit; \
	done
	@echo "$(GREEN)✅ All circuits compiled$(NC)"

compile-circuit:
	@echo "$(BLUE)🔨 Compiling $(CIRCUIT) circuit...$(NC)"
	@mkdir -p $(BUILD_DIR)/$(CIRCUIT)
	@$(CIRCOM) $(SRC_DIR)/$(CIRCUIT).circom --r1cs --wasm --sym --output $(BUILD_DIR)/$(CIRCUIT)
	@echo "$(GREEN)✅ $(CIRCUIT) compiled$(NC)"

# ========== Setup (Phase 2) ==========
setup:
	@for circuit in $(CIRCUITS); do \
		$(MAKE) -s setup-circuit CIRCUIT=$$circuit; \
	done
	@echo "$(GREEN)✅ All circuits setup complete$(NC)"

setup-circuit:
	@if [ ! -f "$(BUILD_DIR)/$(CIRCUIT)/$(CIRCUIT).r1cs" ]; then \
		echo "$(YELLOW)⚠  $(CIRCUIT).r1cs not found, compiling first...$(NC)"; \
		$(MAKE) -s compile-circuit CIRCUIT=$(CIRCUIT); \
	fi
	@echo "$(BLUE)🔑 Setting up $(CIRCUIT) proving key...$(NC)"
	@echo "$(YELLOW)  → Running Groth16 setup...$(NC)"
	@$(SNARKJS) groth16 setup $(BUILD_DIR)/$(CIRCUIT)/$(CIRCUIT).r1cs $(PTAU_FILE) $(BUILD_DIR)/$(CIRCUIT)/$(CIRCUIT)_0000.zkey
	@echo "$(YELLOW)  → Contributing to Phase 2...$(NC)"
	@$(SNARKJS) zkey contribute $(BUILD_DIR)/$(CIRCUIT)/$(CIRCUIT)_0000.zkey $(BUILD_DIR)/$(CIRCUIT)/$(CIRCUIT)_final.zkey \
		--name="dev contribution" -e="dev entropy" -v
	@rm -f $(BUILD_DIR)/$(CIRCUIT)/$(CIRCUIT)_0000.zkey
	@echo "$(YELLOW)  → Exporting verification key...$(NC)"
	@$(SNARKJS) zkey export verificationkey $(BUILD_DIR)/$(CIRCUIT)/$(CIRCUIT)_final.zkey $(BUILD_DIR)/$(CIRCUIT)/vk.json
	@echo "$(YELLOW)  → Computing checksums...$(NC)"
	@echo "1.0.0" > $(BUILD_DIR)/$(CIRCUIT)/VERSION
	@shasum -a 256 $(BUILD_DIR)/$(CIRCUIT)/$(CIRCUIT)_final.zkey > $(BUILD_DIR)/$(CIRCUIT)/$(CIRCUIT)_final.zkey.sha256
	@echo "$(GREEN)✅ $(CIRCUIT) setup complete$(NC)"

# ========== Generate Test Vectors ==========
test-vectors:
	@echo "$(BLUE)📝 Generating test vectors...$(NC)"
	@mkdir -p $(TEST_VECTORS_DIR)
	@node $(SCRIPTS_DIR)/make_vectors.js
	@echo "$(GREEN)✅ Test vectors generated$(NC)"

test-vectors-enhanced:
	@echo "$(BLUE)📝 Generating enhanced test vectors (with negative cases)...$(NC)"
	@mkdir -p $(TEST_VECTORS_DIR)
	@node $(SCRIPTS_DIR)/make_vectors_enhanced.js
	@echo "$(GREEN)✅ Enhanced test vectors generated$(NC)"

# ========== Prove Individual Circuits (snarkjs) ==========
prove-shield: $(BUILD_DIR)/shield/shield_final.zkey test-vectors-enhanced
	@echo "$(BLUE)🔐 Generating shield proof...$(NC)"
	@$(MAKE) -s generate-proof CIRCUIT=shield

prove-transfer: $(BUILD_DIR)/transfer/transfer_final.zkey test-vectors-enhanced
	@echo "$(BLUE)🔐 Generating transfer proof...$(NC)"
	@$(MAKE) -s generate-proof CIRCUIT=transfer

prove-unshield: $(BUILD_DIR)/unshield/unshield_final.zkey test-vectors-enhanced
	@echo "$(BLUE)🔐 Generating unshield proof...$(NC)"
	@$(MAKE) -s generate-proof CIRCUIT=unshield

prove-all: prove-shield prove-transfer prove-unshield
	@echo "$(GREEN)✅ All proofs generated and verified!$(NC)"

# Helper target to generate proof for any circuit
generate-proof:
	@echo "$(YELLOW)  → Computing witness...$(NC)"
	@node $(BUILD_DIR)/$(CIRCUIT)/$(CIRCUIT)_js/generate_witness.js \
		$(BUILD_DIR)/$(CIRCUIT)/$(CIRCUIT)_js/$(CIRCUIT).wasm \
		$(TEST_VECTORS_DIR)/$(CIRCUIT)_input.json \
		$(BUILD_DIR)/$(CIRCUIT)/witness.wtns
	@echo "$(YELLOW)  → Generating proof...$(NC)"
	@$(SNARKJS) groth16 prove \
		$(BUILD_DIR)/$(CIRCUIT)/$(CIRCUIT)_final.zkey \
		$(BUILD_DIR)/$(CIRCUIT)/witness.wtns \
		$(BUILD_DIR)/$(CIRCUIT)/proof.json \
		$(BUILD_DIR)/$(CIRCUIT)/public.json
	@echo "$(YELLOW)  → Verifying proof...$(NC)"
	@$(SNARKJS) groth16 verify \
		$(BUILD_DIR)/$(CIRCUIT)/vk.json \
		$(BUILD_DIR)/$(CIRCUIT)/public.json \
		$(BUILD_DIR)/$(CIRCUIT)/proof.json
	@echo "$(GREEN)✅ $(CIRCUIT) proof verified!$(NC)"

# ========== Prove Individual Circuits (rapidsnark) ==========
prove-shield-fast: $(BUILD_DIR)/shield/shield_final.zkey test-vectors-enhanced
	@echo "$(BLUE)⚡ Generating shield proof (rapidsnark)...$(NC)"
	@$(MAKE) -s generate-proof-fast CIRCUIT=shield

prove-transfer-fast: $(BUILD_DIR)/transfer/transfer_final.zkey test-vectors-enhanced
	@echo "$(BLUE)⚡ Generating transfer proof (rapidsnark)...$(NC)"
	@$(MAKE) -s generate-proof-fast CIRCUIT=transfer

prove-unshield-fast: $(BUILD_DIR)/unshield/unshield_final.zkey test-vectors-enhanced
	@echo "$(BLUE)⚡ Generating unshield proof (rapidsnark)...$(NC)"
	@$(MAKE) -s generate-proof-fast CIRCUIT=unshield

prove-all-fast: prove-shield-fast prove-transfer-fast prove-unshield-fast
	@echo "$(GREEN)✅ All proofs generated (rapidsnark) and verified!$(NC)"

# Helper target for rapidsnark proving
generate-proof-fast:
	@echo "$(YELLOW)  → Computing witness...$(NC)"
	@node $(BUILD_DIR)/$(CIRCUIT)/$(CIRCUIT)_js/generate_witness.js \
		$(BUILD_DIR)/$(CIRCUIT)/$(CIRCUIT)_js/$(CIRCUIT).wasm \
		$(TEST_VECTORS_DIR)/$(CIRCUIT)_input.json \
		$(BUILD_DIR)/$(CIRCUIT)/witness_fast.wtns
	@echo "$(YELLOW)  → Generating proof (rapidsnark)...$(NC)"
	@if command -v $(RAPIDSNARK) &> /dev/null; then \
		$(RAPIDSNARK) $(BUILD_DIR)/$(CIRCUIT)/$(CIRCUIT)_final.zkey \
			$(BUILD_DIR)/$(CIRCUIT)/witness_fast.wtns \
			$(BUILD_DIR)/$(CIRCUIT)/proof_fast.json \
			$(BUILD_DIR)/$(CIRCUIT)/public_fast.json; \
	else \
		echo "$(YELLOW)⚠  rapidsnark not found, falling back to snarkjs$(NC)"; \
		$(SNARKJS) groth16 prove \
			$(BUILD_DIR)/$(CIRCUIT)/$(CIRCUIT)_final.zkey \
			$(BUILD_DIR)/$(CIRCUIT)/witness_fast.wtns \
			$(BUILD_DIR)/$(CIRCUIT)/proof_fast.json \
			$(BUILD_DIR)/$(CIRCUIT)/public_fast.json; \
	fi
	@echo "$(YELLOW)  → Verifying proof...$(NC)"
	@$(SNARKJS) groth16 verify \
		$(BUILD_DIR)/$(CIRCUIT)/vk.json \
		$(BUILD_DIR)/$(CIRCUIT)/public_fast.json \
		$(BUILD_DIR)/$(CIRCUIT)/proof_fast.json
	@echo "$(GREEN)✅ $(CIRCUIT) proof verified (fast)!$(NC)"

# ========== Negative Tests ==========
test-negative: test-vectors-enhanced
	@echo "$(BLUE)🧪 Running negative test suite...$(NC)"
	@node $(SCRIPTS_DIR)/test_negative.js

# ========== Export Verification Keys ==========
export-vk:
	@echo "$(BLUE)📤 Exporting verification keys for Solana...$(NC)"
	@node $(SCRIPTS_DIR)/export_vk.js

# ========== Clean ==========
clean:
	@echo "$(YELLOW)🧹 Cleaning build artifacts...$(NC)"
	@rm -rf $(BUILD_DIR)
	@rm -rf $(EXPORT_DIR)
	@echo "$(GREEN)✅ Build artifacts cleaned (pot preserved)$(NC)"

clean-all: clean
	@echo "$(YELLOW)🧹 Cleaning Powers of Tau...$(NC)"
	@rm -rf $(POT_DIR)
	@echo "$(GREEN)✅ Everything cleaned$(NC)"

# ========== Info ==========
info:
	@echo "$(BLUE)📊 Circuit Build Info$(NC)"
	@echo ""
	@echo "Circuits:"
	@for circuit in $(CIRCUITS); do \
		echo "  - $$circuit"; \
		if [ -f "$(BUILD_DIR)/$$circuit/$$circuit"_final.zkey ]; then \
			echo "    Status: $(GREEN)✓ Built$(NC)"; \
			if [ -f "$(BUILD_DIR)/$$circuit/$$circuit"_final.zkey.sha256 ]; then \
				echo "    SHA256: $$(cat $(BUILD_DIR)/$$circuit/$$circuit"_final.zkey.sha256" | cut -d' ' -f1)"; \
			fi; \
		else \
			echo "    Status: $(YELLOW)⊗ Not built$(NC)"; \
		fi; \
		echo ""; \
	done
