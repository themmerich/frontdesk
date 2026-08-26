package de.prime_ux.backend.crypto;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;
import org.springframework.stereotype.Component;

/**
 * Puts {@link SecretEncryptor} between an entity's field and its column, so a secret is
 * encrypted on the way out and decrypted on the way in without any caller having to remember.
 *
 * <p>A Spring bean rather than a plain converter: Hibernate resolves converters through Spring's
 * bean container in a Boot application, which is what lets this one take the encryptor as a
 * constructor argument instead of reaching for a static.
 */
@Converter
@Component
public class EncryptedStringConverter implements AttributeConverter<String, String> {

	private final SecretEncryptor secretEncryptor;

	EncryptedStringConverter(SecretEncryptor secretEncryptor) {
		this.secretEncryptor = secretEncryptor;
	}

	@Override
	public String convertToDatabaseColumn(String attribute) {
		return attribute == null ? null : this.secretEncryptor.encrypt(attribute);
	}

	@Override
	public String convertToEntityAttribute(String dbData) {
		return this.secretEncryptor.decrypt(dbData);
	}
}
