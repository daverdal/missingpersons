# How to Reset Neo4j Password

## Option 1: Using Neo4j Desktop (Easiest)

1. **Open Neo4j Desktop**
   - Look for the Neo4j Desktop application on your computer
   - If you don't have it, download from: https://neo4j.com/download/

2. **Find Your Database**
   - In Neo4j Desktop, you should see your database project
   - Look for a database named something like "missingpersonsPROD_DB" or the default "neo4j"

3. **Reset the Password**
   - Click on your database project
   - Click the **"..."** (three dots) menu button
   - Select **"Reset DBMS Password"** or **"Reset Password"**
   - Enter a new password (remember this!)
   - Click **"Reset"** or **"OK"**

4. **Update Your .env File**
   - Open your `.env` file
   - Update the `NEO4J_PASSWORD` line with your new password:
     ```
     NEO4J_PASSWORD=your_new_password_here
     ```

5. **Restart Your Server**
   - Stop your Node.js server (Ctrl+C)
   - Start it again: `npm start`

---

## Option 2: Using Neo4j Browser (If Desktop doesn't work)

1. **Open Neo4j Browser**
   - Open a web browser
   - Go to: http://localhost:7474
   - This is the Neo4j Browser interface

2. **Try to Log In**
   - Username: `neo4j`
   - Password: Try your current password first
   - If it works, you can change it using Cypher commands (see below)

3. **If Login Fails - Reset via Command Line**
   - Close Neo4j Desktop/Server
   - Open Command Prompt or PowerShell as Administrator
   - Navigate to your Neo4j installation directory
   - Run the reset command (location varies by installation)

---

## Option 3: Using Cypher (If you can log in)

If you can access Neo4j Browser (http://localhost:7474), you can change the password:

1. Log in to Neo4j Browser
2. Run this command in the query box:
   ```cypher
   ALTER CURRENT USER SET PASSWORD FROM 'old_password' TO 'new_password';
   ```
   Replace `old_password` with your current password and `new_password` with your desired password.

3. Update your `.env` file with the new password

---

## Option 4: Check Neo4j Desktop Settings

1. Open Neo4j Desktop
2. Click on your database
3. Look at the **"Details"** or **"Settings"** panel
4. The password might be displayed there (sometimes it's auto-generated)
5. If you see it, copy it to your `.env` file

---

## Option 5: Reset via Neo4j Installation Directory

If Neo4j is installed as a service or standalone:

1. **Stop Neo4j** (if running as a service)
2. **Find Neo4j installation directory**
   - Usually: `C:\Users\<YourUsername>\.Neo4jDesktop\` or
   - `C:\Program Files\Neo4j\` or
   - Check Neo4j Desktop → Settings → Installation Path

3. **Use cypher-shell** (if available):
   ```powershell
   cd "C:\path\to\neo4j\bin"
   .\cypher-shell.bat -a bolt://localhost:7687 -u neo4j
   ```
   Then run:
   ```cypher
   ALTER CURRENT USER SET PASSWORD FROM 'current' TO 'newpassword';
   ```

---

## Quick Test After Reset

After updating your password, test the connection:

```powershell
node test-neo4j-connection.js
```

This will verify if your new password works.

---

## Still Having Issues?

If none of these work:

1. **Check if Neo4j is actually running:**
   - Look for Neo4j in your system tray (bottom right)
   - Check Task Manager for Neo4j processes
   - Try accessing http://localhost:7474 in a browser

2. **Verify the database name:**
   - Your `.env` shows: `NEO4J_DATABASE=missingpersonsPROD_DB`
   - Make sure this database exists in Neo4j
   - You might need to create it first, or use the default `neo4j` database

3. **Try the default database:**
   - Temporarily change `.env` to: `NEO4J_DATABASE=neo4j`
   - Test the connection again

