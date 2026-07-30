-- Run on seffro database (seffro_jun app)
ALTER TABLE users ADD COLUMN central_user_id BIGINT UNSIGNED NULL UNIQUE AFTER id;
ALTER TABLE vendors ADD COLUMN central_user_id BIGINT UNSIGNED NULL UNIQUE AFTER id;
ALTER TABLE agents ADD COLUMN central_user_id BIGINT UNSIGNED NULL UNIQUE AFTER id;

-- Run on helou database (helppu-1 app)
ALTER TABLE users ADD COLUMN central_user_id INT UNSIGNED NULL UNIQUE AFTER id;
