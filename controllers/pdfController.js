const PDFDocument = require('pdfkit');

/**
 * Generate PDF for case details (applicant and loved ones)
 */
async function generateCaseDetailsPDF(req, res, driver, auditLogger) {
  const { id } = req.params;
  try {
    const session = driver.session();
    // Get applicant, referring org, and related LovedOne(s) - same query as the GET endpoint
    const result = await session.run(
      `MATCH (a:Applicant {id: $id})
       OPTIONAL MATCH (a)-[:REFERRED_BY]->(o:Organization)
       OPTIONAL MATCH (a)-[rel:RELATED_TO]->(l:LovedOne)
       RETURN a, o, collect({lovedOne: l, relationship: rel.relationship}) AS lovedOnes`,
      { id }
    );
    await session.close();
    
    if (!result.records.length) {
      return res.status(404).json({ error: 'Case not found' });
    }
    
    const applicant = result.records[0].get('a').properties;
    const orgNode = result.records[0].get('o');
    const referringOrg = orgNode ? orgNode.properties : null;
    const lovedOnesRaw = result.records[0].get('lovedOnes');
    const lovedOnes = lovedOnesRaw
      .filter(lo => lo.lovedOne)
      .map(lo => ({
        ...lo.lovedOne.properties,
        relationship: lo.relationship || ''
      }));
    
    // Generate PDF
    const doc = new PDFDocument({ margin: 50 });
    
    // Set response headers
    res.setHeader('Content-Type', 'application/pdf');
    const fileName = `Case_Details_${applicant.id || id}_${new Date().toISOString().split('T')[0]}.pdf`;
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    
    // Pipe PDF to response
    doc.pipe(res);
    
    // Title
    doc.fontSize(20).text('Case Details', { align: 'center' });
    doc.moveDown(1);
    doc.fontSize(10).fillColor('#666666').text(`Case ID: ${applicant.id || id}`, { align: 'center' });
    doc.fontSize(10).text(`Generated: ${new Date().toLocaleString()}`, { align: 'center' });
    doc.moveDown(2);
    
    // Helper function to add a field
    const addField = (label, value) => {
      if (value === null || value === undefined || value === '') return;
      doc.fontSize(11)
         .fillColor('#000000')
         .text(label + ': ', { continued: true })
         .fillColor('#333333')
         .text(String(value));
      doc.moveDown(0.4);
    };
    
    // Client Information Section
    doc.fontSize(14).fillColor('#000000').text('Client Information', { underline: true });
    doc.moveDown(0.5);
    if (applicant.status) {
      doc.fontSize(11).fillColor('#000000').text('Status: ', { continued: true })
         .fillColor('#006600').text(applicant.status);
      doc.moveDown(0.4);
    }
    addField('Name', applicant.name);
    addField('Kinship Role', applicant.kinshipRole);
    addField('Contact Number', applicant.contact);
    addField('Email Address', applicant.email);
    addField('Mailing Address', applicant.address);
    addField('First Nation', applicant.community);
    addField('Preferred Language(s)', applicant.language);
    addField('Best Way and Time to Contact', applicant.contactTime);
    if (referringOrg && referringOrg.name) {
      addField('Referring Organization', referringOrg.name);
    }
    if (applicant.notes) {
      doc.moveDown(0.3);
      doc.fontSize(11).fillColor('#000000').text('Notes: ', { continued: true });
      doc.fontSize(10).fillColor('#333333').text(applicant.notes);
      doc.moveDown(0.5);
    }
    // Communication Preferences
    doc.moveDown(0.3);
    doc.fontSize(11).fillColor('#000000').text('Communication Preferences:', { continued: false });
    doc.moveDown(0.3);
    const smsOptIn = applicant.smsOptIn === true ? '✓ Opted In' : applicant.smsOptIn === false ? '✗ Opted Out' : '○ Not Set';
    const emailOptIn = applicant.emailOptIn === true ? '✓ Opted In' : applicant.emailOptIn === false ? '✗ Opted Out' : '○ Not Set';
    doc.fontSize(10).fillColor('#333333').text(`SMS: ${smsOptIn}`, { continued: false });
    doc.fontSize(10).text(`Email: ${emailOptIn}`, { continued: false });
    doc.moveDown(1);
    
    // Missing Person(s) Section
    if (lovedOnes && lovedOnes.length > 0) {
      lovedOnes.forEach((lo, index) => {
        if (index > 0) {
          doc.addPage();
        }
        doc.fontSize(14).fillColor('#000000').text(`Missing Person ${lovedOnes.length > 1 ? `#${index + 1}` : ''}`, { underline: true });
        doc.moveDown(0.5);
        
        if (lo.status) {
          doc.fontSize(11).fillColor('#000000').text('Status: ', { continued: true })
             .fillColor('#006600').text(lo.status);
          doc.moveDown(0.4);
        }
        addField('Name', lo.name);
        addField('Relationship to Client', lo.relationship);
        addField('Community', lo.community);
        addField('Date of Incident', lo.dateOfIncident);
        addField('Last Known Location', lo.lastLocation);
        if (lo.lastLocationLat != null && lo.lastLocationLon != null) {
          addField('Latitude/Longitude', `${lo.lastLocationLat}, ${lo.lastLocationLon}`);
        } else if (lo.lastLocationLat != null) {
          addField('Latitude', lo.lastLocationLat);
        } else if (lo.lastLocationLon != null) {
          addField('Longitude', lo.lastLocationLon);
        }
        addField('Police Investigation Number', lo.policeInvestigationNumber);
        addField('Legal Action Case Number', lo.legalActionCaseNumber);
        addField('Community Search Effort Description', lo.communitySearchEffortDescription);
        
        // Investigation Status
        if (lo.investigation && Array.isArray(lo.investigation) && lo.investigation.length > 0) {
          doc.moveDown(0.3);
          doc.fontSize(11).fillColor('#000000').text('Investigation Status:', { continued: false });
          doc.moveDown(0.3);
          lo.investigation.forEach(inv => {
            doc.fontSize(10).fillColor('#333333').text(`• ${inv}`, { indent: 20 });
          });
          doc.moveDown(0.3);
        }
        if (lo.otherInvestigation) {
          doc.fontSize(10).fillColor('#333333').text(`• Other: ${lo.otherInvestigation}`, { indent: 20 });
          doc.moveDown(0.3);
        }
        
        // Support Requests
        if (lo.supportSelections && Array.isArray(lo.supportSelections) && lo.supportSelections.length > 0) {
          doc.moveDown(0.3);
          doc.fontSize(11).fillColor('#000000').text('Support, Advocacy, and Requests:', { continued: false });
          doc.moveDown(0.3);
          lo.supportSelections.forEach(support => {
            doc.fontSize(10).fillColor('#333333').text(`• ${support}`, { indent: 20 });
          });
          doc.moveDown(0.3);
        }
        if (lo.otherSupport) {
          doc.fontSize(10).fillColor('#333333').text(`• Other: ${lo.otherSupport}`, { indent: 20 });
          doc.moveDown(0.3);
        }
        
        // Additional Notes
        if (lo.additionalNotes) {
          doc.moveDown(0.3);
          doc.fontSize(11).fillColor('#000000').text('Additional Notes: ', { continued: true });
          doc.fontSize(10).fillColor('#333333').text(lo.additionalNotes);
          doc.moveDown(0.5);
        }
      });
    } else {
      doc.moveDown(0.5);
      doc.fontSize(11).fillColor('#666666').text('No missing person information recorded.', { indent: 20 });
      doc.moveDown(1);
    }
    
    // Finalize PDF
    doc.end();
    
    // Log the export
    auditLogger.log(req, {
      action: 'case.export_pdf',
      resourceType: 'applicant',
      resourceId: id,
      success: true
    }).catch(err => console.error('Failed to log PDF export:', err));
    
  } catch (err) {
    console.error('Error generating case PDF:', err);
    auditLogger.log(req, {
      action: 'case.export_pdf',
      resourceType: 'applicant',
      resourceId: id,
      success: false,
      message: err.message
    }).catch(logErr => console.error('Failed to log PDF export error:', logErr));
    res.status(500).json({ error: 'Failed to generate PDF' });
  }
}

/**
 * Generate blank intake form PDF
 */
function generateBlankIntakeFormPDF(req, res, auditLogger) {
  try {
    const doc = new PDFDocument({ margin: 50 });
    
    // Set response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="Intake_Form_Blank.pdf"');
    
    // Pipe PDF to response
    doc.pipe(res);
    
    // Title
    doc.fontSize(20).text('Intake Form - Support Services for Families', { align: 'center' });
    doc.moveDown(2);
    
    // Helper function to add a field
    const addField = (label, value = '') => {
      doc.fontSize(11)
         .fillColor('#000000')
         .text(label + ': ', { continued: true })
         .fillColor('#666666')
         .text(value || '___________________________');
      doc.moveDown(0.5);
    };
    
    // Client Information Section
    doc.fontSize(14).fillColor('#000000').text('Client Information', { underline: true });
    doc.moveDown(0.5);
    addField('Name');
    addField('Kinship Role');
    addField('Status');
    addField('Contact Number');
    addField('Email Address');
    addField('Mailing Address');
    addField('First Nation');
    addField('Preferred Language(s)');
    addField('Best Way and Time to Contact You');
    addField('Referring Organization');
    doc.moveDown(1);
    
    // Missing Loved One Section
    doc.fontSize(14).fillColor('#000000').text('Missing Loved One', { underline: true });
    doc.moveDown(0.5);
    addField('Name of Loved One');
    addField("Client's Relationship to Loved One");
    addField('Status');
    addField('Date of Incident (if known)');
    addField('Location of Incident or Last Known Location');
    addField('Lat/Long (e.g., 49.887129, -97.153645)');
    addField('Community of Loved One');
    doc.moveDown(1);
    
    // Investigation Status Section
    doc.fontSize(14).fillColor('#000000').text('Investigation Status', { underline: true });
    doc.moveDown(0.5);
    addField('Police/RCMP Investigation');
    addField('Investigation Number');
    addField('Community Search Efforts');
    addField('Community Search Effort Description');
    addField('Independent Advocacy');
    addField('Inquest or Legal Action');
    addField('Legal Action Case Number');
    addField('Other Investigation');
    doc.moveDown(1);
    
    // Support, Advocacy, and Requests Section
    doc.fontSize(14).fillColor('#000000').text('Support, Advocacy, and Requests', { underline: true });
    doc.moveDown(0.5);
    addField('Emotional or Cultural Support');
    addField('Grief Counseling or Mental Health Support');
    addField('Legal Advocacy or Representation');
    addField('Help Navigating Police or Justice System');
    addField('Media or Public Awareness Support');
    addField('Help Organizing Vigils or Community Events');
    addField('Financial Assistance or Guidance');
    addField('Transportation or Housing Support');
    addField('Translation or Language Services');
    addField('Youth or Family Support Services');
    addField('Access to Religious or Spiritual Services');
    addField('Access to Traditional Healing or Medicine');
    addField('Ongoing Case Updates or Advocacy');
    addField('Accommodation');
    addField('Other Needs or Requests');
    doc.moveDown(1);
    
    // Additional Notes Section
    doc.fontSize(14).fillColor('#000000').text('Additional Notes or Story (optional)', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(11).fillColor('#666666').text('_________________________________________________________________');
    doc.moveDown(0.3);
    doc.text('_________________________________________________________________');
    doc.moveDown(0.3);
    doc.text('_________________________________________________________________');
    doc.moveDown(0.3);
    doc.text('_________________________________________________________________');
    doc.moveDown(1);
    
    // Communication Preferences Section
    doc.fontSize(14).fillColor('#000000').text('Communication Preferences', { underline: true });
    doc.moveDown(0.5);
    addField('I consent to receive SMS text messages', '☐ Yes  ☐ No');
    addField('I consent to receive email updates', '☐ Yes  ☐ No');
    doc.moveDown(1);
    
    // Consent & Confidentiality Section
    doc.fontSize(14).fillColor('#000000').text('Consent & Confidentiality', { underline: true });
    doc.moveDown(0.5);
    addField('I consent to the department storing my information securely', '☐ Yes  ☐ No');
    addField('I understand that my information will not be shared without my permission', '☐ Yes  ☐ No');
    addField('Signature');
    addField('Date');
    
    // Finalize PDF
    doc.end();
    
    // Log the export
    auditLogger.log(req, {
      action: 'intake.export_pdf',
      resourceType: 'intake_form',
      success: true
    }).catch(err => console.error('Failed to log PDF export:', err));
    
  } catch (err) {
    console.error('Error generating PDF:', err);
    auditLogger.log(req, {
      action: 'intake.export_pdf',
      resourceType: 'intake_form',
      success: false,
      message: err.message
    }).catch(logErr => console.error('Failed to log PDF export error:', logErr));
    res.status(500).json({ error: 'Failed to generate PDF' });
  }
}

module.exports = {
  generateCaseDetailsPDF,
  generateBlankIntakeFormPDF
};

