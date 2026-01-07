"""Unit tests for dice rolling logic."""

import pytest
from src.routers.dice import parse_dice, roll_dice


class TestParseDice:
    """Tests for dice notation parsing."""
    
    def test_parse_simple_dice(self):
        """Test parsing simple dice notation."""
        count, sides, modifier, special = parse_dice("1d20")
        assert count == 1
        assert sides == 20
        assert modifier == 0
        assert special is None
    
    def test_parse_multiple_dice(self):
        """Test parsing multiple dice."""
        count, sides, modifier, special = parse_dice("2d6")
        assert count == 2
        assert sides == 6
    
    def test_parse_with_positive_modifier(self):
        """Test parsing dice with positive modifier."""
        count, sides, modifier, special = parse_dice("1d20+5")
        assert count == 1
        assert sides == 20
        assert modifier == 5
    
    def test_parse_with_negative_modifier(self):
        """Test parsing dice with negative modifier."""
        count, sides, modifier, special = parse_dice("1d20-3")
        assert modifier == -3
    
    def test_parse_keep_highest(self):
        """Test parsing keep highest notation."""
        count, sides, modifier, special = parse_dice("4d6kh3")
        assert count == 4
        assert sides == 6
        assert special == "kh3"
    
    def test_parse_keep_lowest(self):
        """Test parsing keep lowest notation."""
        count, sides, modifier, special = parse_dice("2d20kl1")
        assert count == 2
        assert sides == 20
        assert special == "kl1"
    
    def test_parse_invalid_dice(self):
        """Test parsing invalid dice notation."""
        with pytest.raises(ValueError):
            parse_dice("invalid")


class TestRollDice:
    """Tests for dice rolling function."""
    
    def test_roll_single_die(self):
        """Test rolling a single die."""
        results = roll_dice(1, 20)
        assert len(results) == 1
        assert 1 <= results[0] <= 20
    
    def test_roll_multiple_dice(self):
        """Test rolling multiple dice."""
        results = roll_dice(4, 6)
        assert len(results) == 4
        for r in results:
            assert 1 <= r <= 6
    
    def test_roll_d100(self):
        """Test rolling a d100."""
        results = roll_dice(1, 100)
        assert 1 <= results[0] <= 100
    
    def test_roll_distribution(self):
        """Test that rolls are reasonably distributed."""
        # Roll 1000 d6 and check distribution
        results = [roll_dice(1, 6)[0] for _ in range(1000)]
        
        # Each number should appear roughly 166 times (1000/6)
        for i in range(1, 7):
            count = results.count(i)
            # Allow 50% deviation for randomness
            assert 80 < count < 250, f"d6 roll {i} appeared {count} times"
