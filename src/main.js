const axios = require("axios");
const nodemailer = require("nodemailer");
const { assign } = require("nodemailer/lib/shared");
const fs = require("fs");
const _ = require("lodash");
const { error } = require("console");
const loadConfig = require("./propertyReader");

const config = loadConfig();

// Jira API base URL
const jiraBaseUrl = config.jira.baseUrl;

// Jira API credentials
const jiraUsername = config.jira.username;
const jiraApiToken = config.jira.apiToken;
const jql = config.jira.jql;

// Email credentials
const emailUsername = config.email.username;
const emailPassword = config.email.password;

// Recipients
// // const recipients = [
//   "nitish.kumar@acko.tech",
//     "venkatesh.g@acko.tech",
//     "naresh.rathor@acko.tech",
//     "pawan.chandra@acko.tech",
//     "yash.bhargava@acko.tech",
// // ];
const filterNullFields = (response) => {
  return response.data.issues.map((issue) => {
    let obj = issue.fields;
    for (let prop in issue.fields) {
      // Check if the property key starts with "customfield_" and its value is null
      if (prop.startsWith("customfield_") && obj[prop] === null) {
        // Delete the property from the object
        delete obj[prop];
      }
    }
    return issue;
  });
};

async function getIssuesWithLabel(jql) {
  const response = await axios.get(`${jiraBaseUrl}/search?jql=${jql}`, {
    auth: {
      username: jiraUsername,
      password: jiraApiToken,
    },
  });

  return filterNullFields(response);
}

async function getBugsForIssue(issueKey) {
  const response = await axios.get(
    `${jiraBaseUrl}/search?jql=issue in linkedIssues(${issueKey})`,
    {
      auth: {
        username: jiraUsername,
        password: jiraApiToken,
      },
    }
  );

  return filterNullFields(response);
}

async function sendReport(report, subject = "Daily Jira Report", htmlContent) {
  let transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: emailUsername,
      pass: emailPassword,
    },
  });
  const htmlFilePath = subject.replace(/\s/g, "") + ".html";
  fs.writeFileSync(htmlFilePath, htmlContent);
  let mailOptions = {
    from: emailUsername,
    to: config.recipients.join(", "),
    subject: subject,
    html: report,
    attachments: [
      {
        filename: "report.html",
        path: htmlFilePath,
      },
    ],
  };

  await transporter.sendMail(mailOptions);
}

async function main() {
  const htmlTemplate = fs.readFileSync("./res/emailTemplate.html", "utf8");
  const htmlAttachment = fs.readFileSync("./res/emailattachment.html", "utf8");
  const compiledTemplate = _.template(htmlTemplate);
  const compiledAttachment = _.template(htmlAttachment);
  getIssuesWithLabel(jql).then((issues) => {
    let bugDetails = "";
    //parse the json array response and get the size
    const incidents = issues.map((issue) => {
      return {
        key: issue.key,
        summary: issue.fields.summary,
        assignee: issue.fields.assignee.displayName,
        status: issue.fields.status.name,
        bugs: [],
        totalBugs: 0,
        fixedBugs: 0,
        openBugs: 0,
      };
    });
    incidents.forEach((issue) => {
      getBugsForIssue(issue.key).then((bugs) => {
        const totalBugs = bugs.length;
        issue.totalBugs = totalBugs;
        const fixedBugs = bugs.filter(
          (bug) =>
            bug.fields.status.name === "Done" ||
            bug.fields.status.name === "Closed"
        ).length;
        issue.fixedBugs = fixedBugs;
        const openBugs = totalBugs - fixedBugs;
        issue.openBugs = openBugs;
        bugs.forEach((bug) => {
          const bugSummary = `<tr>\n<td>${bug.key}</td>\n<td>${bug.fields.summary}</td>\n<td>${bug.fields.status.name}</td>\n<td>${bug.fields.assignee.displayName}</td>\n<td>${bug.fields.priority.name}</td>\n</tr>\n`;
          issue.bugs.push({
            key: bug.key,
            summary: bug.fields.summary,
            status: bug.fields.status.name,
            reporter: bug.fields.reporter.displayName,
            assignee: bug.fields.assignee.displayName,
            priority: bug.fields.priority.name,
          });
          bugDetails += bugSummary;
        });

        const report = `Issue: ${issue.key}\nSummary: ${issue.summary}:$ \nTotal Bugs: ${totalBugs}\nFixed Bugs: ${fixedBugs}\nOpen Bugs: ${openBugs}\n`;
        const taskSummary = `<tr>\n<td>${issue.key}</td>\n<td>${issue.summary}</td>\n<td>${issue.assignee}</td>\n<td>${issue.status}</td>\n</tr>`;
        console.log(report);
        const data = {
          TotalBugCount: totalBugs,
          FixedBugCount: fixedBugs,
          OpenBugCount: openBugs,
          TaskName: issue.summary,
          Task: {
            Summary: taskSummary,
          },
          Bug: {
            Summary: bugDetails,
          },
        };
        const htmlReport = compiledTemplate(data);
        const htmlAttachmentReport = compiledAttachment(data);
        // console.log(htmlReport);
        sendReport(
          htmlReport,
          `[Embedded] QA Execution Report of ${issue.summary}`,
          htmlAttachmentReport
        )
          .then(() => console.log(htmlReport))
          .catch((error) => {
            console.error(error);
          });
      });
    });
  });
}

main()
  .then(() => {
    console.log("Report sent successfully");
  })
  .catch(console.error);
