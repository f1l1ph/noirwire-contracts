.PHONY: help install install-solana install-anchor install-deps build build-programs build-circuits test deploy clean check format lint

# Default target
help:
	@echo "NoirWire Contracts - Available Commands"
	@echo "========================================"
	@echo ""
	@echo "Setup Commands:"
	@echo "  make install           - Install all dependencies (Solana, Anchor, Node)"
	@echo "  make install-solana    - Install Solana platform tools (includes cargo-build-sbf)"
	@echo "  make install-anchor    - Install Anchor framework"
	@echo "  make install-deps      - Install Node dependencies"
	@echo ""
	@echo "Build Commands:"
	@echo "  make build             - Build programs and circuits"
	@echo "  make build-programs    - Build Solana programs only"
	@echo "  make build-circuits    - Build ZK circuits only"
	@echo ""
	@echo "Test Commands:"
	@echo "  make test              - Run all tests"
	@echo "  make test-unit         - Run unit tests only"
	@echo "  make test-encoding     - Run encoding tests only"
	@echo "  make test-integration  - Run integration tests only"
	@echo ""
	@echo "Deployment Commands:"
	@echo "  make deploy-devnet     - Deploy to devnet"
	@echo "  make deploy-mainnet    - Deploy to mainnet (⚠️  requires audit)"
	@echo "  make init-devnet       - Initialize pool on devnet"
	@echo "  make upload-vk-devnet  - Upload verification keys to devnet"
	@echo ""
	@echo "Development Commands:"
	@echo "  make check             - Check code without building"
	@echo "  make format            - Format Rust code"
	@echo "  make lint              - Run linters"
	@echo "  make clean             - Clean build artifacts"
	@echo ""
	@echo "Configuration Commands:"
	@echo "  make config-devnet     - Configure Solana CLI for devnet"
	@echo "  make config-mainnet    - Configure Solana CLI for mainnet"
	@echo "  make balance           - Check wallet balance"
	@echo "  make airdrop           - Request devnet airdrop (2 SOL)"
	@echo "  make show-deployment   - Show full deployment info (all PDAs)"
	@echo ""

# Installation targets
install: install-solana install-anchor install-deps
	@echo "✅ All dependencies installed!"

install-solana:
	@echo "🔧 Installing Solana platform tools v1.18.20..."
	@if command -v cargo-build-sbf >/dev/null 2>&1; then \
		echo "✅ Solana platform tools already installed"; \
		cargo-build-sbf --version; \
	else \
		echo "📥 Downloading from release.solana.com..."; \
		sh -c "$$(curl -sSfL https://release.solana.com/v1.18.20/install)"; \
		echo ""; \
		echo "⚠️  Add to your PATH:"; \
		echo "   export PATH=\"\$$HOME/.local/share/solana/install/active_release/bin:\$$PATH\""; \
		echo ""; \
		echo "🔄 Reload shell: source ~/.zshrc"; \
	fi

install-anchor:
	@echo "🔧 Installing Anchor CLI v0.31.1..."
	@if command -v anchor >/dev/null 2>&1; then \
		echo "✅ Anchor already installed"; \
		anchor --version; \
	else \
		cargo install --git https://github.com/coral-xyz/anchor --tag v0.31.1 anchor-cli; \
	fi

install-deps:
	@echo "📦 Installing Node dependencies..."
	@yarn install
	@echo "✅ Node dependencies installed"

# Build targets
build: build-programs build-circuits
	@echo "✅ Build complete!"

build-programs:
	@echo "🔨 Building Solana programs..."
	@if ! command -v cargo-build-sbf >/dev/null 2>&1; then \
		echo "❌ cargo-build-sbf not found!"; \
		echo "   Run: make install-solana"; \
		exit 1; \
	fi
	@anchor build
	@echo "✅ Programs built successfully"
	@echo ""
	@echo "📦 Artifacts:"
	@ls -lh target/deploy/*.so 2>/dev/null || echo "  (no .so files found)"

build-circuits:
	@echo "🔨 Building ZK circuits..."
	@cd zk-circuits && $(MAKE) all
	@echo "✅ Circuits built successfully"

# Test targets
test:
	@echo "🧪 Running all tests..."
	@anchor test

test-unit:
	@echo "🧪 Running unit tests..."
	@npx mocha tests/zk-pool-unit.spec.ts

test-encoding:
	@echo "🧪 Running encoding tests..."
	@npx mocha tests/zk-pool-encoding.spec.ts

test-integration:
	@echo "🧪 Running integration tests..."
	@npx mocha tests/zk-pool.spec.ts

# Deployment targets
deploy-devnet: check-solana-config
	@echo "🚀 Deploying to devnet..."
	@if [ "$$(solana config get | grep 'RPC URL' | awk '{print $$3}')" != "https://api.devnet.solana.com" ]; then \
		echo "❌ Not configured for devnet!"; \
		echo "   Run: make config-devnet"; \
		exit 1; \
	fi
	@anchor deploy --provider.cluster devnet
	@echo "✅ Deployed to devnet"
	@echo ""
	@echo "📋 Next steps:"
	@echo "  1. make init-devnet      - Initialize pool"
	@echo "  2. make upload-vk-devnet - Upload verification keys"

deploy-mainnet: check-solana-config
	@echo "⚠️  MAINNET DEPLOYMENT - ARE YOU SURE?"
	@echo ""
	@echo "Pre-deployment checklist:"
	@echo "  [ ] Security audit completed"
	@echo "  [ ] All tests passing"
	@echo "  [ ] Multi-sig configured"
	@echo "  [ ] Monitoring set up"
	@echo "  [ ] Emergency procedures documented"
	@echo ""
	@read -p "Continue? (type 'YES' to confirm): " confirm; \
	if [ "$$confirm" != "YES" ]; then \
		echo "Deployment cancelled"; \
		exit 1; \
	fi
	@if [ "$$(solana config get | grep 'RPC URL' | awk '{print $$3}')" != "https://api.mainnet-beta.solana.com" ]; then \
		echo "❌ Not configured for mainnet!"; \
		echo "   Run: make config-mainnet"; \
		exit 1; \
	fi
	@anchor deploy --provider.cluster mainnet
	@echo "✅ Deployed to mainnet"
	@echo ""
	@echo "⚠️  IMPORTANT: Transfer upgrade authority to multi-sig!"

init-devnet:
	@echo "🔧 Initializing pool on devnet..."
	@ts-node scripts/initialize-pool.ts
	@echo "✅ Pool initialized"

upload-vk-devnet:
	@echo "📤 Uploading verification keys to devnet..."
	@ts-node scripts/publish-vk.ts
	@echo "✅ Verification keys uploaded"

# Configuration targets
config-devnet:
	@echo "⚙️  Configuring for devnet..."
	@solana config set --url https://api.devnet.solana.com
	@if [ ! -f ~/.config/solana/devnet-wallet.json ]; then \
		echo "⚠️  No devnet wallet found at ~/.config/solana/devnet-wallet.json"; \
		read -p "Create new wallet? (y/n): " create; \
		if [ "$$create" = "y" ]; then \
			mkdir -p ~/.config/solana; \
			solana-keygen new --outfile ~/.config/solana/devnet-wallet.json; \
		fi; \
	fi
	@solana config set --keypair ~/.config/solana/devnet-wallet.json
	@echo "✅ Configured for devnet"
	@make show-config

config-mainnet:
	@echo "⚙️  Configuring for mainnet..."
	@solana config set --url https://api.mainnet-beta.solana.com
	@if [ ! -f ~/.config/solana/mainnet-wallet.json ]; then \
		echo "❌ No mainnet wallet found!"; \
		echo "   Create at: ~/.config/solana/mainnet-wallet.json"; \
		exit 1; \
	fi
	@solana config set --keypair ~/.config/solana/mainnet-wallet.json
	@echo "✅ Configured for mainnet"
	@make show-config

show-config:
	@echo ""
	@echo "📋 Current Configuration:"
	@solana config get
	@echo ""
	@echo "💰 Wallet Balance:"
	@solana balance

balance:
	@solana balance

airdrop:
	@echo "💰 Requesting devnet airdrop..."
	@if [ "$$(solana config get | grep 'RPC URL' | awk '{print $$3}')" != "https://api.devnet.solana.com" ]; then \
		echo "❌ Not on devnet!"; \
		echo "   Run: make config-devnet"; \
		exit 1; \
	fi
	@solana airdrop 2
	@make balance

# Development targets
check:
	@echo "🔍 Checking code..."
	@anchor check
	@cd programs/zk-pool && cargo check
	@cd programs/noirwire-contracts && cargo check
	@echo "✅ No errors found"

format:
	@echo "✨ Formatting code..."
	@cargo fmt --all
	@cd programs/zk-pool && cargo fmt
	@cd programs/noirwire-contracts && cargo fmt
	@echo "✅ Code formatted"

lint:
	@echo "🔍 Running linters..."
	@cargo clippy --all-targets --all-features -- -D warnings
	@yarn lint
	@echo "✅ Linting complete"

clean:
	@echo "🧹 Cleaning build artifacts..."
	@anchor clean
	@rm -rf target/
	@cd zk-circuits && $(MAKE) clean
	@echo "✅ Clean complete"

# Helper targets
check-solana-config:
	@if ! command -v solana >/dev/null 2>&1; then \
		echo "❌ Solana CLI not found!"; \
		echo "   Run: make install-solana"; \
		exit 1; \
	fi
	@if ! command -v anchor >/dev/null 2>&1; then \
		echo "❌ Anchor not found!"; \
		echo "   Run: make install-anchor"; \
		exit 1; \
	fi

# Program ID management
show-program-ids:
	@echo "📋 Program IDs:"
	@echo ""
	@echo "zk-pool:"
	@solana-keygen pubkey target/deploy/zk_pool-keypair.json 2>/dev/null || echo "  (keypair not found)"
	@echo ""
	@echo "noirwire-contracts:"
	@solana-keygen pubkey target/deploy/noirwire_contracts-keypair.json 2>/dev/null || echo "  (keypair not found)"
	@echo ""
	@echo "Anchor.toml configuration:"
	@grep -A 10 "\[programs.devnet\]" Anchor.toml || echo "  (not configured)"

show-deployment:
	@echo "📋 Full Deployment Info"
	@echo "======================="
	@npx ts-node deployment-config.ts

verify-program-ids:
	@echo "🔍 Verifying program IDs match Anchor.toml..."
	@zk_pool_keypair=$$(solana-keygen pubkey target/deploy/zk_pool-keypair.json 2>/dev/null); \
	zk_pool_config=$$(grep "zk_pool = " Anchor.toml | cut -d'"' -f2); \
	if [ "$$zk_pool_keypair" = "$$zk_pool_config" ]; then \
		echo "✅ zk-pool: $$zk_pool_keypair"; \
	else \
		echo "❌ zk-pool mismatch!"; \
		echo "   Keypair: $$zk_pool_keypair"; \
		echo "   Config:  $$zk_pool_config"; \
		exit 1; \
	fi

# Logs and monitoring
logs-devnet:
	@echo "📊 Fetching devnet logs..."
	@solana logs --url https://api.devnet.solana.com

logs-mainnet:
	@echo "📊 Fetching mainnet logs..."
	@solana logs --url https://api.mainnet-beta.solana.com

# Version info
versions:
	@echo "📦 Installed Versions:"
	@echo ""
	@echo "Solana CLI:"
	@solana --version 2>/dev/null || echo "  Not installed"
	@echo ""
	@echo "Anchor CLI:"
	@anchor --version 2>/dev/null || echo "  Not installed"
	@echo ""
	@echo "Cargo Build SBF:"
	@cargo-build-sbf --version 2>/dev/null || echo "  Not installed (run: make install-solana)"
	@echo ""
	@echo "Rust:"
	@rustc --version 2>/dev/null || echo "  Not installed"
	@echo ""
	@echo "Node.js:"
	@node --version 2>/dev/null || echo "  Not installed"
	@echo ""
	@echo "Yarn:"
	@yarn --version 2>/dev/null || echo "  Not installed"
