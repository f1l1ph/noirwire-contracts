use anchor_lang::prelude::*;
use crate::constants::*;
use crate::errors::ZkPoolError;
use crate::events::PoolPausedChanged;
use crate::state::*;

#[derive(Accounts)]
pub struct SetPaused<'info> {
    #[account(
        mut,
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = admin @ ZkPoolError::Unauthorized
    )]
    pub config: Account<'info, PoolConfig>,
    
    pub admin: Signer<'info>,
}

pub fn set_paused(ctx: Context<SetPaused>, paused: bool) -> Result<()> {
    let config = &mut ctx.accounts.config;
    config.paused = paused;
    
    emit!(PoolPausedChanged {
        paused,
        admin: ctx.accounts.admin.key(),
        timestamp: Clock::get()?.unix_timestamp,
    });
    
    Ok(())
}
