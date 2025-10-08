// EmailJS Configuration
// Get these values from https://emailjs.com dashboard

export const EMAILJS_CONFIG = {
  // Get from EmailJS Dashboard > Account > General
  PUBLIC_KEY: 'a1G5c01uj9gXf8gCh',
  
  // Get from EmailJS Dashboard > Email Services
  SERVICE_ID: 'service_a5zyw4z', 
  
  // Get from EmailJS Dashboard > Email Templates
  TEMPLATE_ID: 'template_eex2l6b'
};

// Example configuration (replace with your actual values):
// export const EMAILJS_CONFIG = {
//   PUBLIC_KEY: 'abc123def456',
//   SERVICE_ID: 'service_gmail123', 
//   TEMPLATE_ID: 'template_invitation'
// };

/* 
SETUP INSTRUCTIONS:

1. Go to https://emailjs.com and create a free account

2. Add Email Service:
   - Click "Add New Service"
   - Choose Gmail (or your preferred provider)
   - Follow authentication steps
   - Note the Service ID

3. Create Email Template:
   - Click "Create New Template"
   - Use these template variables:
     - {{from_name}} - Sender's name
     - {{to_email}} - Recipient email
     - {{project_name}} - Project name
     - {{project_id}} - Project ID for joining
     - {{custom_message}} - Personal message
     - {{subject}} - Email subject
   
   Example template:
   Subject: {{subject}}
   
   Hi there!
   
   {{from_name}} has invited you to collaborate on "{{project_name}}".
   
   {{custom_message}}
   
   To join:
   1. Go to CodeCollab platform
   2. Click "Join by Project ID"
   3. Enter this Project ID: {{project_id}}
   
   Best regards,
   CodeCollab Team

4. Get Public Key:
   - Go to Account > General
   - Copy the Public Key

5. Update this file with your actual values
*/