package de.prime_ux.backend.aisettings;

import static org.assertj.core.api.Assertions.assertThat;

import de.prime_ux.backend.aiusage.AiCallKind;
import de.prime_ux.backend.aiusage.RecordingAiCalls;
import de.prime_ux.backend.tenants.Tenant;
import org.junit.jupiter.api.Test;

/** Trying a key out, and what is written down about it. No Spring context, no provider. */
class ApiKeyTesterTest {

	private static final Tenant TENANT = new Tenant("Musterfirma GmbH", "musterfirma");

	@Test
	void recordsTheTestCallForTheTenantWithoutACase() {
		RecordingAiCalls aiCalls = new RecordingAiCalls();
		ApiKeyTester tester = new ApiKeyTester(StubChatClients.answering("pong", 8, 2), aiCalls);

		assertThat(tester.test(TENANT, "sk-ant-api03-testkey").success()).isTrue();

		assertThat(aiCalls.recorded).hasSize(1);
		RecordingAiCalls.Recorded recorded = aiCalls.recorded.getFirst();
		assertThat(recorded.tenant()).isSameAs(TENANT);
		assertThat(recorded.mailCase()).isNull();
		assertThat(recorded.kind()).isEqualTo(AiCallKind.KEY_TEST);
		assertThat(recorded.response().getMetadata().getUsage().getPromptTokens()).isEqualTo(8);
	}

	@Test
	void reportsARejectedKeyAsAResultAndRecordsNothing() {
		RecordingAiCalls aiCalls = new RecordingAiCalls();
		ApiKeyTester tester = new ApiKeyTester(StubChatClients.failing("invalid x-api-key"), aiCalls);

		ApiKeyTester.ApiKeyTestResult result = tester.test(TENANT, "sk-ant-api03-wrong");

		assertThat(result.success()).isFalse();
		assertThat(result.message()).contains("invalid x-api-key");
		// Nothing came back, so nothing was used.
		assertThat(aiCalls.recorded).isEmpty();
	}
}
