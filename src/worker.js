import puppeteer from 'puppeteer';
import { queueManager } from './queue.js';

export function startWorker() {
    queueManager.on('processTask', async (task) => {
        console.log(`Starting task ${task.id} for ${task.url}`);

        let browser;
        let taskCancelled = false;

        const cancelHandler = async (deletedId) => {
            if (deletedId === task.id) {
                console.log(`Task ${task.id} cancelled by user.`);
                taskCancelled = true;
                queueManager.addTaskLog(task.id, 'Task cancelled by user.');
                if (browser) {
                    try {
                        await browser.close();
                    } catch (e) { /* ignore */ }
                }
            }
        };

        queueManager.on('taskDeleted', cancelHandler);

        try {
            browser = await puppeteer.launch({
                headless: false, // Open visible window
                defaultViewport: { width: 1920, height: 1080 }, // Explicit viewport
                args: ['--start-maximized', '--no-sandbox', '--disable-setuid-sandbox'],
                slowMo: 50 // Slow down operations by 50ms so user can see
            });

            // Get the pages and use the first one (which is already open)
            const pages = await browser.pages();
            const page = pages.length > 0 ? pages[0] : await browser.newPage();

            // Set viewport explicitly again for the page
            await page.setViewport({ width: 1920, height: 1080 });

            // Check cancellation
            if (taskCancelled) throw new Error('Task cancelled');

            // Navigate with retry logic
            queueManager.addTaskLog(task.id, `Navigating to ${task.url}`);
            let navigated = false;
            for (let attempt = 1; attempt <= 3; attempt++) {
                if (taskCancelled) throw new Error('Task cancelled');
                try {
                    await page.goto(task.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
                    navigated = true;
                    break;
                } catch (navError) {
                    if (taskCancelled) throw new Error('Task cancelled');
                    console.error(`Navigation attempt ${attempt} failed: ${navError.message}`);
                    queueManager.addTaskLog(task.id, `Navigation attempt ${attempt} failed: ${navError.message}`);
                    if (attempt === 3) throw navError;
                    await new Promise(r => setTimeout(r, 2000)); // Wait before retry
                }
            }

            // Safe Ad & Footer Removal
            try {
                if (taskCancelled) throw new Error('Task cancelled');
                await page.addStyleTag({
                    content: `
                        #fixedban, footer, #adplus-anchor, .ad-plus-container, #google_esf { display: none !important; }
                    `
                });
                queueManager.addTaskLog(task.id, 'Page loaded & Cleaned');
            } catch (styleError) {
                if (taskCancelled) throw styleError; // Re-throw if cancelled
                console.warn('Failed to inject style tag:', styleError);
                queueManager.addTaskLog(task.id, 'Warning: Could not hide ads, proceeding anyway.');
            }

            // Fill forms
            const results = [];
            let failureCount = 0;

            // Analyze fields and filter data
            // ... (keeping existing logic for analysis) ...
            const validFields = [];
            let firstName = '';
            let lastName = '';

            // 1. Extract known values and check existence
            for (const field of task.formData) {
                if (taskCancelled) throw new Error('Task cancelled');
                const { selector, value } = field;

                // Extract name data for potential combination
                if (selector.toLowerCase().includes('first')) firstName = value;
                if (selector.toLowerCase().includes('last')) lastName = value;

                // Check if selector exists on page
                try {
                    const element = await page.$(selector);
                    if (element) {
                        // Deduplication: Check if we already queued this element
                        const isDuplicate = await page.evaluate(el => {
                            if (el.getAttribute('data-ag-queued') === 'true') return true;
                            el.setAttribute('data-ag-queued', 'true');
                            return false;
                        }, element);

                        if (isDuplicate) {
                            // Already matched by a previous selector, skip
                            continue;
                        }

                        // Check visibility/interactability to be safe, but existence is key
                        const isVisible = await element.boundingBox();
                        if (isVisible) {
                            validFields.push(field);
                        } else {
                            // If it exists but is hidden (like file inputs or radio inputs), we might still want it
                            // But for text inputs, hidden usually means "don't fill".
                            // Let's keep it if it's not explicitly hidden style
                            validFields.push(field);
                        }
                    }
                } catch (e) {
                    // Invalid selector or other error, skip
                }
            }

            // 2. Smart Name Handling: If specific name fields weren't found, look for a full name field
            const firstNameFieldFound = validFields.some(f => f.selector.toLowerCase().includes('first'));
            const lastNameFieldFound = validFields.some(f => f.selector.toLowerCase().includes('last'));

            if ((!firstNameFieldFound || !lastNameFieldFound) && firstName && lastName) {
                queueManager.addTaskLog(task.id, 'Specific name fields missing, looking for Full Name field...');

                // Potential selectors for a full name field
                const potentialNameSelectors = ['#userName', '#name', '#fullName', '#user-name', 'input[placeholder="Full Name"]', 'input[placeholder="Name"]'];

                for (const sel of potentialNameSelectors) {
                    if (taskCancelled) throw new Error('Task cancelled');
                    // Ensure we don't overwrite an existing valid field
                    const isCovered = validFields.some(f => f.selector === sel);
                    if (!isCovered) {
                        try {
                            const exists = await page.$(sel);
                            if (exists) {
                                validFields.push({ selector: sel, value: `${firstName} ${lastName}` });
                                queueManager.addTaskLog(task.id, `Found generic name field ${sel}, combining First and Last name.`);
                                break; // Stop after finding one match
                            }
                        } catch (e) { }
                    }
                }
            }

            if (validFields.length === 0) {
                queueManager.failTask(task.id, 'No matching fields found on the page.');
                // Close browser if we fail early
                if (browser) await browser.close();
                return;
            }

            queueManager.addTaskLog(task.id, `Identified ${validFields.length} fields to fill.`);

            for (const field of validFields) {
                if (taskCancelled) throw new Error('Task cancelled');
                // Check if page is still open
                if (page.isClosed()) {
                    throw new Error('Page closed unexpectedly');
                }

                const { selector, value } = field;
                try {
                    queueManager.addTaskLog(task.id, `Processing: ${selector}`);

                    // Wait for selector (removed visible: true to be more lenient)
                    await page.waitForSelector(selector, { timeout: 5000 });

                    // Scroll into view
                    await page.evaluate((sel) => {
                        const el = document.querySelector(sel);
                        if (el) el.scrollIntoView({ block: 'center', inline: 'center' });
                    }, selector);

                    // Small delay for stability
                    await new Promise(r => setTimeout(r, 300));

                    // Special handling for Date of Birth (React Datepicker)
                    if (selector === '#dateOfBirthInput') {
                        await page.click(selector);
                        await page.waitForSelector('.react-datepicker__year-select', { timeout: 5000 });
                        await page.select('.react-datepicker__year-select', '1993');
                        await page.select('.react-datepicker__month-select', '4');
                        await page.click('.react-datepicker__day--015');
                        queueManager.addTaskLog(task.id, `Selected Date: ${value}`);

                    } else if (selector === '#state' || selector === '#city') {
                        // React Select handling
                        await page.click(selector);
                        await page.keyboard.type(value);
                        await page.waitForSelector('div[id^="react-select"][id*="-option-"]', { timeout: 5000 });
                        await page.keyboard.press('Enter');
                        queueManager.addTaskLog(task.id, `Selected '${value}' in ${selector}`);

                    } else if (selector.includes('subjectsInput')) {
                        // Subjects Auto-complete
                        await page.click(selector);
                        await page.type(selector, value);
                        await page.waitForSelector('.subjects-auto-complete__menu', { timeout: 5000 });
                        await page.keyboard.press('Enter');
                        queueManager.addTaskLog(task.id, `Selected Subject: ${value}`);

                    } else {
                        // Standard handling
                        const tagName = await page.$eval(selector, el => el.tagName.toLowerCase());
                        const inputType = await page.$eval(selector, el => el.getAttribute('type'));

                        if (tagName === 'label') {
                            // Just click labels (used for custom radios/checkboxes)
                            await page.click(selector);
                            queueManager.addTaskLog(task.id, `Clicked label ${selector}`);
                        } else if (tagName === 'select') {
                            await page.select(selector, value);
                        } else if (inputType === 'file') {
                            // File Upload Handling
                            queueManager.addTaskLog(task.id, `File input detected: ${selector}`);

                            // Pause and wait for user upload
                            queueManager.updateTaskStatus(task.id, 'WAITING_FOR_FILE', { selector });
                            queueManager.addTaskLog(task.id, `Waiting for user to upload file for ${selector}...`);

                            // Wait for file upload event
                            const filePath = await new Promise((resolve, reject) => {
                                const timeout = setTimeout(() => {
                                    queueManager.off('fileUploaded', handler);
                                    queueManager.off('taskDeleted', cancelListener);
                                    reject(new Error('Timed out waiting for file upload'));
                                }, 300000); // 5 minutes timeout

                                const handler = (taskId, fileSelector, path) => {
                                    if (taskId === task.id && fileSelector === selector) {
                                        clearTimeout(timeout);
                                        queueManager.off('fileUploaded', handler);
                                        queueManager.off('taskDeleted', cancelListener);
                                        resolve(path);
                                    }
                                };

                                const cancelListener = (deletedId) => {
                                    if (deletedId === task.id) {
                                        clearTimeout(timeout);
                                        queueManager.off('fileUploaded', handler);
                                        queueManager.off('taskDeleted', cancelListener);
                                        reject(new Error('Task cancelled during upload wait'));
                                    }
                                };

                                queueManager.on('fileUploaded', handler);
                                queueManager.on('taskDeleted', cancelListener);
                            });

                            if (taskCancelled) throw new Error('Task cancelled');

                            queueManager.addTaskLog(task.id, `File received: ${filePath}`);
                            queueManager.updateTaskStatus(task.id, 'PROCESSING'); // Resume status

                            const element = await page.$(selector);
                            await element.uploadFile(filePath);
                            queueManager.addTaskLog(task.id, `File uploaded to form`);

                        } else if (inputType === 'checkbox' || inputType === 'radio') {
                            try {
                                await page.click(selector);
                            } catch (e) {
                                await page.evaluate((sel) => document.querySelector(sel).click(), selector);
                            }
                        } else {
                            // Inputs/Textareas - Try standard typing, fallback to evaluate
                            try {
                                await page.click(selector, { clickCount: 3 });
                                await page.keyboard.press('Backspace');
                                await page.type(selector, value);
                            } catch (e) {
                                // Fallback: Set value directly via JS if typing fails
                                await page.evaluate((sel, val) => {
                                    const el = document.querySelector(sel);
                                    el.value = val;
                                    el.dispatchEvent(new Event('input', { bubbles: true }));
                                    el.dispatchEvent(new Event('change', { bubbles: true }));
                                }, selector, value);
                                queueManager.addTaskLog(task.id, `Filled ${selector} via JS fallback`);
                            }
                        }
                        queueManager.addTaskLog(task.id, `Filled ${selector}`);
                    }
                    results.push({ selector, status: 'filled' });
                } catch (err) {
                    if (err.message === 'Task cancelled' || err.message === 'Task cancelled during upload wait') throw err;
                    failureCount++;
                    console.error(`Failed to fill ${selector}: ${err.message}`);
                    queueManager.addTaskLog(task.id, `Error filling ${selector}: ${err.message}`);
                    results.push({ selector, status: 'failed', error: err.message });
                }
            }


            // Automatic Form Submission
            try {
                if (taskCancelled) throw new Error('Task cancelled');
                queueManager.addTaskLog(task.id, 'Attempting to submit form...');
                const submitSelectors = ['#submit', 'button[type="submit"]', 'input[type="submit"]', '.submit-button', 'button:contains("Submit")', '#FSsubmit', 'input[name="Submit"]'];
                let submitted = false;
                for (const sel of submitSelectors) {
                    const btn = await page.$(sel);
                    if (btn) {
                        await page.evaluate((s) => document.querySelector(s).click(), sel);
                        submitted = true;
                        queueManager.addTaskLog(task.id, `Clicked submit button: ${sel}`);
                        break;
                    }
                }
                if (!submitted) {
                    queueManager.addTaskLog(task.id, 'No submit button found, skipping submission.');
                } else {
                    // Wait for navigation or success message
                    queueManager.addTaskLog(task.id, 'Waiting for submission to complete...');
                    try {
                        await page.waitForFunction(() => {
                            if (taskCancelled) return true; // Break wait if cancelled
                            const text = document.body.innerText.toLowerCase();
                            return text.includes('thank') ||
                                text.includes('success') ||
                                text.includes('received') ||
                                text.includes('submitted') ||
                                text.includes('completed');
                        }, { timeout: 15000 });
                        if (taskCancelled) throw new Error('Task cancelled');
                        queueManager.addTaskLog(task.id, 'Success message detected.');
                    } catch (e) {
                        if (taskCancelled || e.message === 'Task cancelled') throw new Error('Task cancelled');
                        queueManager.addTaskLog(task.id, 'Warning: Success message not detected (timeout), but proceeding.');
                    }

                    // Keep browser open for a moment to let user see
                    await new Promise(r => setTimeout(r, 2000));
                }
            } catch (submitError) {
                if (submitError.message === 'Task cancelled') throw submitError;
                queueManager.addTaskLog(task.id, `Error submitting form: ${submitError.message}`);
            }

            // Determine final status
            if (taskCancelled) {
                // Do nothing, already handled
            } else if (failureCount === 0) {
                queueManager.addTaskLog(task.id, 'Task completed successfully');
                queueManager.completeTask(task.id, { fields: results });
            } else if (failureCount < task.formData.length) {
                queueManager.addTaskLog(task.id, `Task completed with ${failureCount} errors`);
                queueManager.updateTaskStatus(task.id, 'PARTIAL_SUCCESS', { fields: results });
            } else {
                queueManager.addTaskLog(task.id, 'Task failed: All fields failed');
                queueManager.failTask(task.id, 'All fields failed to fill. Check selectors.');
            }

            // Keep browser open for a moment to let user see
            await new Promise(r => setTimeout(r, 2000));

        } catch (error) {
            console.error(`Task ${task.id} failed:`, error);
            // Don't fail the task if it was cancelled, as it's already deleted
            if (error.message !== 'Task cancelled' && error.message !== 'Task cancelled during upload wait') {
                queueManager.addTaskLog(task.id, `Task failed: ${error.message}`);
                queueManager.failTask(task.id, error.message);
            } else {
                // Ensure queue is unblocked even if task is gone
                queueManager.isProcessing = false;
                queueManager.processQueue();
            }
        } finally {
            queueManager.off('taskDeleted', cancelHandler);
            if (browser) await browser.close();
        }
    });

    console.log('Worker started and listening for tasks...');
}
