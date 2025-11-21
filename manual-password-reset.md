# Manual Neo4j Password Reset - When UI Options Don't Work

Since you can't find the password reset option in Neo4j Desktop, here are manual methods:

## Method 1: Check Neo4j Desktop Details Panel

1. **Open Neo4j Desktop**
2. **Click on your database** (make sure it's selected)
3. **Look at the RIGHT side panel** - there should be a "Details" or "Information" section
4. **Look for:**
   - Connection string (might show password)
   - Password field (might be hidden but copyable)
   - "Show Password" button
   - Any authentication/security section

## Method 2: Find Password in Neo4j Desktop Settings

1. **Open Neo4j Desktop**
2. **Click on your database**
3. **Look for "Open Folder" or "Open Terminal"** button
4. **Click it** - this opens the database folder
5. **Look for files like:**
   - `conf/neo4j.conf`
   - `data/dbms/auth` (this is the auth file)
   - Any `.properties` files

## Method 3: Access Neo4j Browser Directly

1. **Make sure Neo4j is STARTED** (not stopped)
2. **Open your web browser**
3. **Go to:** http://localhost:7474
4. **Try logging in with:**
   - Username: `neo4j`
   - Password: Try these common ones:
     - `neo4j`
     - `password`
     - `admin`
     - `123456`
     - The password from your .env file
5. **If you can log in**, run this command in the query box:
   ```cypher
   ALTER CURRENT USER SET PASSWORD FROM 'current_password' TO 'new_password';
   ```

## Method 4: Use cypher-shell (Command Line)

1. **Find cypher-shell:**
   - In Neo4j Desktop, right-click your database
   - Click "Open Folder" or "Open Terminal"
   - Navigate to the `bin` folder
   - Look for `cypher-shell.bat` (Windows) or `cypher-shell` (Mac/Linux)

2. **Or find it manually:**
   ```powershell
   # Common locations:
   C:\Users\<YourUsername>\.Neo4jDesktop\relate-data\dbmss\dbms-*\bin\cypher-shell.bat
   ```

3. **Run cypher-shell:**
   ```powershell
   .\cypher-shell.bat -a bolt://localhost:7687 -u neo4j
   ```
   It will prompt for password - try common ones

4. **If it works, change password:**
   ```cypher
   ALTER CURRENT USER SET PASSWORD FROM 'old' TO 'new';
   ```

## Method 5: Delete Auth File (Complete Reset)

⚠️ **WARNING: This will delete ALL user accounts and reset to default!**

1. **STOP Neo4j database** in Neo4j Desktop

2. **Find the database folder:**
   - Right-click database → "Open Folder"
   - Or look in: `C:\Users\<YourUsername>\.Neo4jDesktop\relate-data\databases\`

3. **Navigate to:** `data/dbms/`

4. **Delete or rename the `auth` file/folder**

5. **START Neo4j database**

6. **Default credentials will be:**
   - Username: `neo4j`
   - Password: `neo4j`

7. **Log in and immediately change it:**
   ```cypher
   ALTER CURRENT USER SET PASSWORD FROM 'neo4j' TO 'your_new_password';
   ```

## Method 6: Check Neo4j Desktop Version

Different versions have different UIs:

1. **Check your Neo4j Desktop version:**
   - Help → About
   - Or Settings → About

2. **For older versions (< 1.5):**
   - The reset might be under "Manage" → "Reset Password"
   - Or in the database settings panel

3. **For newer versions:**
   - Try right-clicking on the database name (not the project)
   - Look for "Settings" or "Manage"
   - Check "Security" tab

## Method 7: Try the Auto-Discovery Script

Run this to try common passwords:

```powershell
node find-neo4j-password.js
```

This will test common default passwords and help you find the right one.

## Method 8: Check Connection String in Neo4j Desktop

1. **Open Neo4j Desktop**
2. **Click on your database**
3. **Look for "Connection Details" or "Connect" button**
4. **Click it** - it might show a connection string with the password
5. **Or look for "Copy Connection String"** - it might include credentials

## Still Stuck?

If none of these work:

1. **Take a screenshot** of your Neo4j Desktop interface
2. **Note your Neo4j Desktop version**
3. **Check Neo4j documentation** for your specific version
4. **Consider reinstalling Neo4j Desktop** (backup your data first!)

