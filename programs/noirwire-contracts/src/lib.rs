use anchor_lang::prelude::*;

declare_id!("6vySUQGyA67t7UtXKuauvn5QHZscj9fG26SZegq7UnCf");

#[program]
pub mod noirwire_contracts {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        msg!("Greetings from: {:?}", ctx.program_id);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
