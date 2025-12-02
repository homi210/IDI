# IDI Bank - Simple Backend

This repository includes an Express backend to save user profiles (username, hashed password, fullName, email) and front-end pages for sign-up, login, account and admin management.

## Files added
 - `server.js` - Express server with endpoints: POST /api/signup, POST /api/login, GET /api/users
- `users.json` - file where profiles are stored
- `package.json` - Node project file
- `Signup.html` - Sign up form to add new users
 - `Signup.html` - Sign up form to add new users
 - `Account.html` - Account dashboard showing your balance and allows sending "IDI" to other users (requires login)

## How to run
1. Install dependencies (requires Node.js >= 14)

```bash
npm install
```

2. Start the server

```bash
npm start
```

3. Open your browser to `http://localhost:3000/Index.html` to view the home page. `Login.html` and `Signup.html` are available.

-
- The frontend performs client-side validation for basic rules (username length, password length, email format); the server validates again and returns structured errors. Form errors are displayed inline in the UI if validation fails.
- Passwords are hashed with `bcryptjs`, but this storage approach is meant for demonstration only.
- For production, use a database and secure authentication tokens (JWT/OAuth), HTTPS, and proper input validation.
 - Tokens are no longer auto-created at user login. Instead, tokens must be created by a central admin account. Admin credentials are stored in `admin_credentials.txt` and contain a JSON object. NOTE: for personal project/demo the admin password is stored in plaintext.

	```json
	{ "username": "admin", "password": "<plain-text password>" }
	```

	The `Admin.html` console or the `POST /api/admin/token` endpoint can be used to create tokens for users:

	```bash
	# create token for a user (admin credentials required)
	curl -s -X POST http://localhost:3000/api/admin/token \
		-H 'Content-Type: application/json' \
		-d '{"adminUsername":"admin","adminPassword":"SECRET","username":"alice" }' | jq .
	```

	To change the admin password you can use the `POST /api/admin/set` endpoint:
	```bash
	curl -s -X POST http://localhost:3000/api/admin/set \
		-H 'Content-Type: application/json' \
		-d '{"adminUsername":"admin","adminPassword":"OLD","newPassword":"NEW" }' | jq .
	```

	Notes: `admin_credentials.txt` stores the admin password as plain text for this demo. Edit it directly if you wish, e.g.:
	```bash
	echo '{"username":"admin","password":"your_password"}' > admin_credentials.txt
	```

Another convenient tool is `gen_admin_hash.sh` included in the repo; it prints a bcrypt hash for a given password:

```bash
chmod +x gen_admin_hash.sh
./gen_admin_hash.sh "your_password"
```
 - For production, use a database and secure authentication tokens (JWT/OAuth), HTTPS, and proper input validation.
 - The project includes an `Account.html` page and a `/api/send` endpoint to transfer IDI between users. Transfers require:
	 - A valid logged-in token sent in `Authorization: Bearer <token>` header
	 - A valid recipient username (3-20 chars, letters/numbers/_)
	 - A positive amount that the sender can cover
	 Example:
	 ```bash
	 # login first to get token
	 TOK=$(curl -s -X POST http://localhost:3000/api/login -H 'Content-Type: application/json' -d '{"username":"testuser","password":"password123"}' | jq -r '.token')
	 curl -s -H "Authorization: Bearer $TOK" -X POST http://localhost:3000/api/send -H 'Content-Type: application/json' -d '{"toUsername":"Homi","amount":50}' | jq .
	 ```

## Autostart on macOS (LaunchAgent)

If you'd like the server to automatically start after a reboot or login, you can use a macOS LaunchAgent. I added a `start-server.sh` wrapper script and a sample LaunchAgent plist (`com.idibank.server.plist`) in the repository.

Installation steps (per-user, macOS):
1. Copy the plist to your LaunchAgents directory:
```bash
cp /Users/30lin_h/Desktop/Bank/com.idibank.server.plist ~/Library/LaunchAgents/
```
2. Make sure `start-server.sh` is executable and logs directory exists (the repo includes the script but ensure it has the correct path to node for your system):
```bash
chmod +x /Users/30lin_h/Desktop/Bank/start-server.sh
mkdir -p /Users/30lin_h/Desktop/Bank/logs
```
3. Load the agent:
```bash
launchctl load ~/Library/LaunchAgents/com.idibank.server.plist
```
4. The server will now start at login and will restart on crash due to `KeepAlive` set to true. To unload the agent:
```bash
launchctl unload ~/Library/LaunchAgents/com.idibank.server.plist
```

Notes / Troubleshooting:
- The plist uses `/Users/30lin_h/Desktop/Bank/start-server.sh` and calls the Node binary; by default the script uses `/opt/homebrew/bin/node`. If you installed Node via a different method, update `start-server.sh` or the plist accordingly.
- LaunchAgents run under a limited environment: `PATH` in the plist is set to common locations but you can set any needed environment variables in the file under `EnvironmentVariables`.
- To view logs: `tail -f /Users/30lin_h/Desktop/Bank/logs/launchd.out.log` and `/Users/30lin_h/Desktop/Bank/logs/launchd.err.log`.


Enjoy! Feel free to ask for extra features (external DB, JWT, session cookies, validation, password reset, etc.).