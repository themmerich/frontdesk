package de.prime_ux.backend.aiusage;

import de.prime_ux.backend.cases.Case;
import de.prime_ux.backend.tenants.Tenant;
import java.util.ArrayList;
import java.util.List;
import org.springframework.ai.chat.model.ChatResponse;

/** Stands in for {@link AiCalls} and only remembers what it was asked to record. */
public final class RecordingAiCalls implements AiCallRecorder {

	public record Recorded(Tenant tenant, Case mailCase, AiCallKind kind, ChatResponse response) {
	}

	public final List<Recorded> recorded = new ArrayList<>();

	@Override
	public void record(Tenant tenant, Case mailCase, AiCallKind kind, ChatResponse response) {
		recorded.add(new Recorded(tenant, mailCase, kind, response));
	}
}
