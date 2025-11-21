# How to Reset Neo4j Password - Step by Step

## Method 1: Neo4j Desktop (STOP DB FIRST)

**YES, you typically need to STOP the database first!**

1. **Open Neo4j Desktop**

2. **Find your database project** (looks like a folder/project icon)

3. **STOP the database:**
   - Click on your database project
   - Look for a **"Stop"** button (usually red or has a stop icon)
   - Click it and wait for it to fully stop
   - The status should show "Stopped" or be grayed out

4. **Now reset the password:**
   - With the database STOPPED, click the **"..."** (three dots) menu
   - You should now see options like:
     - **"Reset DBMS Password"**
     - **"Reset Password"**
     - **"Change Password"**
   - Click on it
   - Enter your new password
   - Click **"Reset"** or **"OK"**

5. **Start the database again:**
   - Click the **"Start"** button (usually green)
   - Wait for it to start (status should show "Running")

6. **Update your .env file:**
   ```
   NEO4J_PASSWORD=your_new_password
   ```

7. **Test the connection:**
   ```powershell
   node test-neo4j-connection.js
   ```

---

## Method 2: Check Neo4j Desktop Settings/Details

Sometimes the password is visible in the database details:

1. **Open Neo4j Desktop**
2. **Click on your database project**
3. **Look at the right panel** - there should be a "Details" or "Settings" section
4. **Check for:**
   - Password field (might be hidden with dots, but you can copy it)
   - Connection string (might show the password)
   - Any "Show Password" button

---

## Method 3: Using Cypher Shell (Command Line)

If you have cypher-shell installed:

1. **Open PowerShell or Command Prompt**

2. **Navigate to Neo4j bin directory** (if installed standalone):
   ```powershell
   cd "C:\Users\<YourUsername>\.Neo4jDesktop\relate-data\dbmss\dbms-<some-id>\bin"
   ```
   Or find it in Neo4j Desktop:
   - Right-click database → "Open Folder" → "bin"

3. **Run cypher-shell:**
   ```powershell
   .\cypher-shell.bat -a bolt://localhost:7687 -u neo4j
   ```
   It will prompt for password - try your current one

4. **If it works, change password:**
   ```cypher
   ALTER CURRENT USER SET PASSWORD FROM 'old_password' TO 'new_password';
   ```

---

## Method 4: Reset via Neo4j Desktop - Alternative Location

The reset option might be in a different location:

1. **Right-click on your database project** (not the database itself, but the project)
2. Look for **"Manage"** or **"Settings"**
3. Check for **"Security"** or **"Authentication"** section
4. Look for password reset options there

---

## Method 5: Check if Password is in Neo4j Desktop Config

1. **Open Neo4j Desktop**
2. **Click on your database**
3. **Look for "Open Folder" or "Open Terminal"** option
4. **Navigate to the database folder**
5. **Look for config files** that might contain the password
   - Usually in: `conf/neo4j.conf` or similar
   - But passwords are usually encrypted, so this might not help

---

## Method 6: If You Have Access to Neo4j Browser

1. **Try to access:** http://localhost:7474
2. **If it asks for login:**
   - Username: `neo4j`
   - Password: Try common defaults like:
     - `neo4j`
     - `password`
     - `admin`
     - `123456`
     - (or check Neo4j Desktop for auto-generated password)

3. **If you can log in:**
   - Run this in the query box:
   ```cypher
   ALTER CURRENT USER SET PASSWORD FROM 'current_password' TO 'new_password';
   ```

---

## Method 7: Complete Reset (Last Resort)

If nothing else works, you might need to:

1. **Stop Neo4j completely**
2. **Delete the auth file** (this will reset ALL users):
   - Location varies, but usually in:
     - `data/dbms/auth` (in your Neo4j database folder)
   - **WARNING:** This will delete all user accounts!
3. **Start Neo4j** - it will create a default `neo4j` user with password `neo4j`
4. **Change it immediately** using one of the methods above

---

## Quick Checklist

- [ ] Database is STOPPED
- [ ] Looking in the "..." menu while database is stopped
- [ ] Checked "Details" or "Settings" panel
- [ ] Tried right-clicking on the project (not just the database)
- [ ] Checked Neo4j Browser at http://localhost:7474
- [ ] Tried the alternative script: `node reset-neo4j-password-alternative.js`

---

## Still Can't Find It?

1. **Take a screenshot** of your Neo4j Desktop interface
2. **Check the Neo4j Desktop version** - older versions have different UIs
3. **Try updating Neo4j Desktop** to the latest version
4. **Check Neo4j documentation** for your specific version

