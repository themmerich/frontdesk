package de.prime_ux.backend.users;

import de.prime_ux.backend.auth.CurrentUserResponse;
import jakarta.validation.Valid;
import java.io.IOException;
import java.util.Set;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

/**
 * The signed-in user's own profile: display name, password, and profile picture. Every endpoint
 * acts on the session user only — nobody edits anyone else here (that will be the admin's user
 * management one day).
 */
@RestController
@RequestMapping("/api/profile")
class ProfileController {

	private static final Set<String> ALLOWED_IMAGE_TYPES = Set.of(MediaType.IMAGE_PNG_VALUE,
			MediaType.IMAGE_JPEG_VALUE, "image/webp");
	private static final long MAX_IMAGE_BYTES = 2 * 1024 * 1024;

	private final AppUserRepository appUserRepository;
	private final UserAvatarRepository userAvatarRepository;
	private final PasswordEncoder passwordEncoder;

	ProfileController(AppUserRepository appUserRepository, UserAvatarRepository userAvatarRepository,
			PasswordEncoder passwordEncoder) {
		this.appUserRepository = appUserRepository;
		this.userAvatarRepository = userAvatarRepository;
		this.passwordEncoder = passwordEncoder;
	}

	@PutMapping
	@Transactional
	CurrentUserResponse updateProfile(@Valid @RequestBody UpdateProfileRequest request,
			Authentication authentication) {
		AppUser user = currentUser(authentication);
		user.rename(request.displayName().trim());
		appUserRepository.save(user);
		return CurrentUserResponse.from(user, userAvatarRepository.existsByUserId(user.getId()));
	}

	@PutMapping("/password")
	@Transactional
	void changePassword(@Valid @RequestBody ChangePasswordRequest request, Authentication authentication) {
		AppUser user = currentUser(authentication);
		if (!passwordEncoder.matches(request.currentPassword(), user.getPasswordHash())) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "current password is wrong");
		}
		user.changePassword(passwordEncoder.encode(request.newPassword()));
		appUserRepository.save(user);
	}

	@PutMapping("/avatar")
	@Transactional
	void uploadAvatar(@RequestParam("file") MultipartFile file, Authentication authentication) {
		AppUser user = currentUser(authentication);
		if (file.isEmpty() || file.getSize() > MAX_IMAGE_BYTES) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "image must be between 1 byte and 2 MB");
		}
		String contentType = file.getContentType();
		if (contentType == null || !ALLOWED_IMAGE_TYPES.contains(contentType)) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "image must be PNG, JPEG, or WebP");
		}
		byte[] image = readBytes(file);
		userAvatarRepository.findByUserId(user.getId()).ifPresentOrElse(
				avatar -> avatar.replace(image, contentType),
				() -> userAvatarRepository.save(new UserAvatar(user, image, contentType)));
	}

	@GetMapping("/avatar")
	ResponseEntity<byte[]> getAvatar(Authentication authentication) {
		AppUser user = currentUser(authentication);
		return userAvatarRepository.findByUserId(user.getId())
				.map(avatar -> ResponseEntity.ok()
						// The frontend busts the cache with a version query parameter after
						// an upload; no-cache keeps stale proxies out of the picture.
						.cacheControl(CacheControl.noCache())
						.contentType(MediaType.parseMediaType(avatar.getContentType()))
						.body(avatar.getImage()))
				.orElseGet(() -> ResponseEntity.notFound().build());
	}

	@DeleteMapping("/avatar")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	@Transactional
	void deleteAvatar(Authentication authentication) {
		AppUser user = currentUser(authentication);
		userAvatarRepository.deleteByUserId(user.getId());
	}

	private byte[] readBytes(MultipartFile file) {
		try {
			return file.getBytes();
		} catch (IOException e) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "image could not be read", e);
		}
	}

	private AppUser currentUser(Authentication authentication) {
		return appUserRepository.findByEmailIgnoreCase(authentication.getName())
				.orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
	}
}
