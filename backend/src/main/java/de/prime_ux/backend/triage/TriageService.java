package de.prime_ux.backend.triage;

import de.prime_ux.backend.cases.Case;

import java.util.List;

/**
 * Classifies one mail into one of the tenant's categories. The implementation talks to a model;
 * the tests use a deterministic stand-in, so the suite never needs an API key.
 *
 * <p>Deliberately the whole AI surface: what happens with a classified case is decided by
 * {@link TriageRule}, not here.
 */
public interface TriageService {

	/**
	 * @throws TriageException when the classification could not be obtained
	 */
	TriageVerdict classify(Case mailCase, List<CaseCategory> categories, TenantTriageSettings settings);
}
