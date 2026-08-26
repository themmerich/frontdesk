package de.prime_ux.backend.triage;

/**
 * The colour a tenant may put on a category, which the inbox then uses as the text colour of every
 * case classified as such.
 *
 * <p>A fixed palette rather than a free colour: the app renders in a light and a dark theme, and a
 * hex value picked in one of them is regularly unreadable in the other. Each name here stands for
 * a pair of values kept in the frontend's stylesheet, so what travels is the choice, not one of
 * the two colours it resolves to.
 *
 * <p>No colour at all is a null column, not a value in here — "none" is the absence of a choice.
 */
public enum CategoryColor {

	BLUE, GREEN, AMBER, RED, VIOLET, TEAL, GREY
}
