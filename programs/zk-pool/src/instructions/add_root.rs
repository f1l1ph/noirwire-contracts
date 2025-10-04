use crate::constants::*;
use crate::errors::ZkPoolError;
use crate::events::RootAdded;
use crate::state::*;
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct AddRoot<'info> {
    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = admin @ ZkPoolError::Unauthorized
    )]
    pub config: Account<'info, PoolConfig>,

    #[account(
        mut,
        seeds = [ROOTS_SEED],
        bump
    )]
    pub roots: Account<'info, RootsAccount>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub admin: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn add_root(ctx: Context<AddRoot>, root: [u8; 32]) -> Result<()> {
    let roots = &mut ctx.accounts.roots;

    // Ensure roots account is initialized (via initialize instruction)
    require!(roots.capacity > 0, ZkPoolError::VkNotSet);

    // Add root to ring buffer
    let index = roots.cursor;
    roots.add_root(root);

    emit!(RootAdded {
        root,
        index,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}
