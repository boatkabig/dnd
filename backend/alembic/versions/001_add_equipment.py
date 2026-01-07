"""Add equipment tables

Revision ID: 001_add_equipment
Revises: 
Create Date: 2024-12-26

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '001_add_equipment'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create srd_equipment table (master data)
    op.create_table(
        'srd_equipment',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('equipment_id', sa.String(100), unique=True, nullable=False, index=True),
        sa.Column('category', sa.String(50), nullable=False, index=True),
        sa.Column('subcategory', sa.String(50), nullable=True),
        sa.Column('weight', sa.Float, default=0.0),
        sa.Column('cost_gp', sa.Float, default=0.0),
        sa.Column('requires_attunement', sa.Boolean, default=False),
        sa.Column('rarity', sa.String(20), nullable=True),
        sa.Column('properties', postgresql.JSONB, default={}),
    )
    
    # Create character_equipment_slots table
    op.create_table(
        'character_equipment_slots',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('character_id', postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column('slot', sa.String(30), nullable=False),
        sa.Column('equipment_id', sa.String(100), nullable=False),
    )
    
    # Create srd_damage_types table (master data)
    op.create_table(
        'srd_damage_types',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('damage_type_id', sa.String(50), unique=True, nullable=False, index=True),
        sa.Column('category', sa.String(30), nullable=False),
        sa.Column('properties', postgresql.JSONB, default={}),
    )


def downgrade() -> None:
    op.drop_table('srd_damage_types')
    op.drop_table('character_equipment_slots')
    op.drop_table('srd_equipment')
