# Nineteen
Nineteen is a qualitative data visualization tool, created by Ted Pollari & Kim Erwin.
It takes excel spreadsheets / .csv files and turns them into interactive visualizations for researchers.


### Basic Usage
Nineteen translates excel worksheets and .csv files into interactive data visualizations. 
New users may find it helpful to try the example link at the bottom of Nineteen's main page first, before reading more here.

The simplest use is to pick a file from your local files with the "Choose a file" button. 
Each row of your data file becomes box in Nineteen's visualization. You can control how data is displayed using two settings: grouping and color-coding. 

Use “group” to display your data so that it is organized by a single column heading, such as participant. Apply “color code” to show how 
data in another column heading are distributed in your groups. For example: you can “group” your data by participant name (say, column 1), 
then color code by any other column, such as age (column 2). 


### File Formatting
A few quick guidelines:
- For Excel workbooks (.xlsx files), Nineteen only references the *first* worksheet
- For both .xlsx and .csv files: 
  - Columns have names in the first row (e.g.: "Participant Name","Segment", "Date","Description","Response Text", etc)
  - After the first row, each line is treated is transformed into a unique "box" or unit of data in Nineteen's visualization
  
### Example File:
- Try out a demo from the main page of Nineteen: click "Try an example" on Nineteen's main page
- To see the example file, [download it here](https://github.com/UseNineteen/nineteen/blob/main/app/downloads/shopping_decision_diary.xlsx?raw=true)

### A Note About Data Privacy
All data processing happens in the browser. Users' data never makes it back to the server, with two possible exceptions - described below 
this means your research is *your research*. You can use it for confidential data without worrying about uploading your data to some random server, as 
long as you avoid two features:

1. If you want to save copies of the visualization as a static image or as a packaged HTML file that will open with a saved view of the data & 
allow full interaction with it, you can – but this will require a brief round-trip of your data so things can be packaged up. 
No data is ever saved or stored.
2. Importing data hosted elsewhere on the internet -  If you choose to source a file hosted elsewhere, Nineteen will attempt to make a local XHR request, 
but only if the user's browser supports both the File API and XHR Response Type Blob. Otherwise, it will use the server will to download 
the file and convert it. It may also end up using the server process if the remotely hosted data's server does not set the 
Access-Control-Allow-Origin header. 

In both cases, data is not stored on the server longer than it takes to process your request and send the data back to your browser. 
Your data is your data.




## Need More Help?
Email [Ted Pollari](mailto:ted@pollari.org?subject=Nineteen%20Help) and/or [Kim Erwin](mailto:kerwin@id.iit.edu?subject=Nineteen%20Help), 
the creators of Nineteen -- We'd also love to hear how you're using Nineteen, if it's useful!

