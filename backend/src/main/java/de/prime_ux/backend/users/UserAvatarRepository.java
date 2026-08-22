package de.prime_ux.backend.users;

import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UserAvatarRepository extends JpaRepository<UserAvatar, UUID> {

	Optional<UserAvatar> findByUserId(UUID userId);

	boolean existsByUserId(UUID userId);

	void deleteByUserId(UUID userId);
}
