package de.prime_ux.backend.replies;

import jakarta.validation.constraints.Size;

/**
 * What a person wants of the reply the model is about to write: "decline, and name our
 * availability this year" — or, where a draft exists, what to change about it: "shorter". A line,
 * not a letter; absent or blank means the model writes the reply as the mail asks for it.
 */
record GenerateDraftRequest(@Size(max = 1000) String instruction) {
}
