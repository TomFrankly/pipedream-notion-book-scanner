import axios from "axios";
import retry from "async-retry";
import Bottleneck from "bottleneck";

/**
 * Goal: Take in an array containing one or more ISBN-13 numbers. For each, run the book fetch workflow I've already created. Then create a Notion page for each book.
 * 
 * Still trying to figure out how to make the looping scan action work on iOS. If I can't get it to work, we'll just build this into Flylighter.
 */

export default {
	name: "Notion Book Fetcher",
	description:
		"Fetches one or more books using scanned ISBN-13 numbers, and creates a Notion page for each book.",
	key: "notion-book-fetcher",
	version: "0.0.1",
	type: "action",
	props: {
		google_books_key: {
			type: "string",
			label: "Google Books API Key",
			description: `If you'd like to use the Google Books API to fetch book data, either enter your Google Books API key here or store is as an environment variable with the name GOOGLE_BOOKS.
            
            You can get a Google Books API key by following the instructions here: https://developers.google.com/books/docs/v1/using#APIKey.
            
            If you don't enter a key here or store on as an environment variable named GOOGLE_BOOKS, this step will only use the Open Library API to fetch book data.`,
			optional: true,
			secret: true,
		},
		notion: {
			type: "app",
			app: "notion",
		},
		databaseID: {
			type: "string",
			label: "Books Database",
			description: "Set you Books database.",
			async options({ query, prevContext }) {
				const notion = new Client({
					auth: this.notion.$auth.oauth_access_token,
				});

				let start_cursor = prevContext?.cursor;

				const response = await notion.search({
					...(query ? { query } : {}),
					...(start_cursor ? { start_cursor } : {}),
					page_size: 50,
					filter: {
						value: "database",
						property: "object",
					},
					sorts: [
						{
							direction: "descending",
							property: "last_edited_time",
						},
					],
				});

				const options = response.results.map((db) => ({
					label: db.title?.[0]?.plain_text,
					value: db.id,
				}));

				return {
					context: {
						cursor: response.next_cursor,
					},
					options,
				};
			},
			reloadProps: true,
		},
	},
	async additionalProps() {
		if (!this.databaseID) {
			return {};
		}

		const notion = new Client({
			auth: this.notion.$auth.oauth_access_token,
		});

		const database = await notion.databases.retrieve({
			database_id: this.databaseID,
		});

		const allowedTypes = ["title", "number", "rich_text", "files"];

		const properties = database.properties;

		const allowedProperties = Object.keys(properties).filter((key) =>
			allowedTypes.includes(properties[key].type)
		);

		return {
			title: {
				type: "string",
				label: "Book Title",
				description: "The title of the book.",
				optional: false,
				options: allowedProperties.map((prop) => ({
					label: prop,
					value: prop,
				})),
			},
			author: {
				type: "string",
				label: "Author",
				description: "The author of the book.",
				optional: true,
				options: allowedProperties.map((prop) => ({
					label: prop,
					value: prop,
				})),
			},
			publish_year: {
				type: "string",
				label: "Publish Year",
				description: "The publish year of the book.",
				optional: true,
				options: allowedProperties.map((prop) => ({
					label: prop,
					value: prop,
				})),
			},
			page_count: {
				type: "string",
				label: "Page Count",
				description: "The page count of the book.",
				optional: true,
				options: allowedProperties.map((prop) => ({
					label: prop,
					value: prop,
				})),
			},
			isbn_13: {
				type: "string",
				label: "ISBN-13 Number",
				description: "The ISBN-13 number of the book.",
				optional: true,
				options: allowedProperties.map((prop) => ({
					label: prop,
					value: prop,
				})),
			},
			cover_image: {
				type: "string",
				label: "Book Cover Image",
				description:
					"The file path to the book's cover image. You can select a Files & Media property here if you want to fill it with the book's cover image URL, which will also be set as the page's cover image.",
				optional: true,
				options: allowedProperties.map((prop) => ({
					label: prop,
					value: prop,
				})),
			},
		};
	},
	methods: {
		/**
		 * Fetches the book data from the given URL. This is a generic method that can make requests to multiple APIs.
		 *
		 * In this case, we'll use it to fetch data from both Google Books and Open Library.
		 *
		 * Uses async-retry to retry the request up to 3 times if it fails.
		 */
		async fetchBookData(url) {
			return await retry(
				async (bail, attempt) => {
					try {
						console.log(`Fetching data from URL: ${url} (Attempt ${attempt})`);
						const response = await axios.get(url);
						if (response.status === 200) {
							return response.data;
						} else {
							throw new Error(`Status code: ${response.status}`);
						}
					} catch (error) {
						if (
							error.response &&
							error.response.status >= 400 &&
							error.response.status < 500
						) {
							bail(
								new Error(
									`Cannot retry due to error: ${error.message} (Status code: ${error.response.status})`
								)
							);
						} else {
							console.error(
								`Retrying due to error: ${error.message} (Status code: ${error.response.status})`
							);
						}
					}
				},
				{
					retries: 3,
				}
			);
		},
		/**
		 * Gets the highest-resolution cover image available from Open Library, given the book's ISBN.
		 */
		async fetchBookCover(isbn) {
			// Get the highest-resolution cover from Open Library that we can
			console.log(`Attempting to fetch the cover image.`);
			const sizes = ["L", "M", "S"];

			const baseCoverURL = `https://covers.openlibrary.org/b/isbn/${isbn}`;

			// For each size, starting from the largest size, see if the cover exists.
			for (let size of sizes) {
				console.log(`Checking cover size: ${size}`);

				// When we add "?default=false" to the URL, cover images that don't exist will return a 404.
				const coverURL = `${baseCoverURL}-${size}.jpg?default=false`;

				try {
					const response = await axios.get(coverURL, {
						validateStatus: (status) => status === 200 && status !== 404,
					});

					if (response.status === 200) {
						console.log(`Cover found for size: ${size}`);
						return coverURL.replace(/\?default=false$/, "");
					}
				} catch (error) {
					if (error.response.status === 404) {
						console.log(`Cover not found for size: ${size}`);
					} else {
						console.error(`Encountered error fetching cover: ${error.message}`);
					}
				}
			}
		},
		async createNotionPage(data) {
			// Create a new Notion client
			const notion = new Client({
				auth: this.notion.$auth.oauth_access_token,
			});

			// Log the data object for debugging
			console.log(`Data object for the new Notion page:`);
			console.dir(data);

			// Build a request that will retry upon failure
			try {
				return await retry(
					async (bail, attempt) => {
						try {
							console.log(`Creating new page in Notion (Attempt ${attempt})`);
							const response = await notion.pages.create(data);
							return response;
						} catch (error) {
							if (error.status >= 400 && error.status < 409) {
								bail(
									new Error(
										`Cannot retry due to error: ${error.message} (Status code: ${error.status})`
									)
								);
							} else {
								console.error(
									`Retrying due to error: ${error.message} (Status code: ${error.status})`
								);
							}
						}
					},
					{
						retries: 3,
					}
				);
			} catch (error) {
				throw new Error(
					`Failed to create the new page in Notion due to error: ${error.message}`
				);
			}
		},
		/**
		 * Builds the book title, appending the subtitle to the original title if it exists.
		 */
		buildBookTitle(book) {
			console.log(`Building the book title.`);
			let title = book.title;

			if (book.subtitle && book.subtitle !== "") {
				title += `: ${book.subtitle}`;
			}

			return title;
		},
		/**
		 * Constructs the final book record, removing any empty fields.
		 */
		constructBookRecord(book) {
			// Remove empty fields from the book record
			const finalBookRecord = Object.keys(book).reduce((acc, key) => {
				if (book[key] !== "") {
					acc[key] = book[key];
				}

				return acc;
			}, {});

			console.log(`Final book record with blank fields removed:`);
			console.dir(finalBookRecord);

			return finalBookRecord;
		},
	},
	async run({ steps, $ }) {
		try {
			// Set a variable for the Google Books API key. If it ends up null, we'll use the Open Library API instead.
			let googleBooksAPIKey =
				process.env.GOOGLE_BOOKS && process.env.GOOGLE_BOOKS !== ""
					? process.env.GOOGLE_BOOKS
					: this.google_books_key && this.google_books_key !== ""
					? this.google_books_key
					: null;
            

            // Get the ISBN-13 numbers from the input

		} catch (error) {
			throw new Error(`Error fetching book data: ${error.message}`);
		}
	},
};
