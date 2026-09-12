package de.prime_ux.backend.cases;

import de.prime_ux.backend.users.AppUser;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.stereotype.Service;
import tools.jackson.databind.json.JsonMapper;

/**
 * Writes down what happens to a case. One method, called wherever something happens: the ingest,
 * the triage run, the controllers, the drafting. Each caller says what happened, who did it — or
 * nobody, for the runs — and what is worth knowing about it.
 *
 * <p>Details are a flat map of strings, numbers and booleans, stored as JSON text and handed to
 * the page as an object. What the keys are per type is the page's business to read; here they
 * are only kept.
 */
@Service
public class CaseEvents {

	private final CaseEventRepository caseEventRepository;
	private final JsonMapper jsonMapper;

	public CaseEvents(CaseEventRepository caseEventRepository, JsonMapper jsonMapper) {
		this.caseEventRepository = caseEventRepository;
		this.jsonMapper = jsonMapper;
	}

	/**
	 * @param actor who did it, or null for something the system did on its own
	 * @param details what is worth knowing, or an empty map
	 */
	public CaseEvent record(Case mailCase, CaseEventType type, AppUser actor, Map<String, ?> details) {
		return caseEventRepository.save(new CaseEvent(mailCase, type, actor, nameOf(actor),
				jsonMapper.writeValueAsString(details)));
	}

	/** The details of an event as an object again, for the response. */
	@SuppressWarnings("unchecked")
	public Map<String, Object> detailsOf(CaseEvent event) {
		return jsonMapper.readValue(event.getDetails(), Map.class);
	}

	/**
	 * Keys and values in turn, as {@code details("tier", tier, "categoryName", name)}. A null value
	 * leaves its key out: nothing was known, so nothing is said.
	 */
	public static Map<String, Object> details(Object... keysAndValues) {
		Map<String, Object> details = new LinkedHashMap<>();
		for (int i = 0; i + 1 < keysAndValues.length; i += 2) {
			if (keysAndValues[i + 1] != null) {
				details.put(String.valueOf(keysAndValues[i]), keysAndValues[i + 1]);
			}
		}
		return details;
	}

	/** The name as it stands now; the event keeps it even if the account changes or goes. */
	static String nameOf(AppUser actor) {
		if (actor == null) {
			return null;
		}
		return (actor.getFirstName() + " " + actor.getLastName()).trim();
	}
}
