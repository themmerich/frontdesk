package de.prime_ux.backend.aiusage;

import java.util.List;
import org.springframework.ai.chat.messages.AssistantMessage;
import org.springframework.ai.chat.metadata.ChatResponseMetadata;
import org.springframework.ai.chat.metadata.DefaultUsage;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.chat.model.Generation;

/** Answers as the model would hand them back: one text, and the metadata every answer carries. */
public final class ChatResponses {

	private ChatResponses() {
	}

	public static ChatResponse of(String text, String model, int inputTokens, int outputTokens) {
		return ChatResponse.builder()
				.generations(List.of(new Generation(new AssistantMessage(text))))
				.metadata(ChatResponseMetadata.builder()
						.model(model)
						.usage(new DefaultUsage(inputTokens, outputTokens))
						.build())
				.build();
	}

	/**
	 * An answer that says nothing about what it cost — which the Anthropic model never does. The
	 * builder fills in an empty usage rather than none, which is what a response without one
	 * looks like to the recorder either way.
	 */
	public static ChatResponse withoutUsage(String text) {
		return ChatResponse.builder()
				.generations(List.of(new Generation(new AssistantMessage(text))))
				.metadata(ChatResponseMetadata.builder().model("claude-sonnet-5").build())
				.build();
	}
}
