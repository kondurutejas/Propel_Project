"""Small unsupervised knowledge checks. Not proctored or a certification.
Answers remain on the server; score is computed from the submitted choices.
"""
BANK = {
 'Python':[
 ('Which type is immutable?', ['list','dict','tuple','set'],2),
 ('What is the value of len({1, 1, 2})?', ['1','2','3','Error'],1),
 ('What does a context manager help guarantee?', ['CPU parallelism','Resource cleanup','Static typing','Faster loops'],1),
 ('Which operation is usually O(1) on a dict?', ['Key lookup','Sorting keys','Copying all values','Printing all entries'],0)],
 'Java':[
 ('What runs Java bytecode?', ['JVM','CSS engine','npm','pip'],0),
 ('Which keyword prevents class inheritance?', ['static','public','final','void'],2),
 ('Which collection prohibits duplicate elements?', ['List','Set','ArrayList','Queue'],1),
 ('Which compares string content?', ['== always','equals()','instanceof','length()'],1)],
 'JavaScript':[
 ('Which declaration is block scoped?', ['var','let','global','function only'],1),
 ('What does await do inside an async function?', ['Blocks every browser task','Waits for promise settlement in that function','Starts a new process','Disables errors'],1),
 ('Which checks equality without type coercion?', ['=','==','===','!='],2),
 ('Which method transforms each array item?', ['map','push','pop','join'],0)],
 'SQL':[
 ('Which clause filters groups after aggregation?', ['WHERE','HAVING','ORDER BY','LIMIT'],1),
 ('Which join keeps all rows from the left table?', ['INNER JOIN','LEFT JOIN','CROSS JOIN','SELF only'],1),
 ('Why use query parameters?', ['Avoid SQL injection','Guarantee an index','Delete duplicates','Disable transactions'],0),
 ('Which constraint uniquely identifies a row?', ['DEFAULT','CHECK only','PRIMARY KEY','ORDER BY'],2)],
 'Git':[
 ('Which records staged changes?', ['git commit','git fetch','git status','git log'],0),
 ('What does git fetch do?', ['Deletes local files','Retrieves remote refs without merging','Publishes every branch','Resets the worktree'],1),
 ('What is a merge conflict?', ['Expired license','Changes Git cannot combine automatically','A deleted account','A syntax error always'],1),
 ('Which shows unstaged changes?', ['git diff','git init','git clone','git tag'],0)],
 'Data Structures':[
 ('Which structure is FIFO?', ['Stack','Queue','Tree','Set'],1),
 ('Which structure is LIFO?', ['Queue','Stack','Heap always','Graph'],1),
 ('Average lookup time for a well-sized hash table?', ['O(1)','O(n squared)','O(n log n)','O(n) always'],0),
 ('Which structure supports hierarchical relationships?', ['Tree','Single scalar','Boolean','Character'],0)],
 'Algorithms':[
 ('Binary search requires what?', ['Random order','Sorted search space','Linked nodes only','Duplicate values'],1),
 ('Binary search time complexity?', ['O(n)','O(log n)','O(n squared)','O(n factorial)'],1),
 ('Dynamic programming reuses what?', ['Overlapping subproblem results','Only random guesses','Network packets','Compiler warnings'],0),
 ('Does a greedy choice always give a global optimum?', ['Yes','No','Only in Python','Only on weekdays'],1)],
 'REST API':[
 ('Which HTTP method normally reads a resource?', ['GET','DELETE','PATCH','POST only'],0),
 ('Which status means not found?', ['200','201','404','500'],2),
 ('What does idempotent mean?', ['Always fast','Repeating a request has the same intended effect as once','No authentication','Always cached'],1),
 ('Where should access control be enforced?', ['Only CSS','Only frontend','Server','Only documentation'],2)],
 'Linux':[
 ('Which command lists files?', ['ls','cd','pwd','mkdir'],0),
 ('Which changes file permissions?', ['chmod','cat','grep','touch'],0),
 ('What does a pipe connect?', ['Output of one command to input of another','Two monitors','Only folders','Passwords'],0),
 ('Which displays the current directory?', ['pwd','rm','cp','mv'],0)],
 'Docker':[
 ('An image is best described as?', ['A runtime container instance','A template used to start containers','A virtual monitor','A password'],1),
 ('Why use a volume?', ['Persist data beyond container lifetime','Encrypt all traffic automatically','Increase CPU cores','Skip backups'],0),
 ('Which file commonly defines an image build?', ['Dockerfile','package-lock only','README only','index.html'],0),
 ('What does publishing a port do?', ['Expose a container port via a host port','Upload source to GitHub','Create a volume','Stop networking'],0)],
 'OOP':[
 ('Encapsulation primarily controls what?', ['Access to internal state','Network bandwidth','Disk speed','SQL joins'],0),
 ('Polymorphism allows what?', ['Different implementations through a common interface','Only one class','No methods','Only global variables'],0),
 ('Composition models which relation?', ['Has a','Is always identical to','Must inherit','Cannot contain'],0),
 ('An object is typically an instance of what?', ['A class','A port','A comment','A process ID'],0)],
 'Testing':[
 ('A unit test usually targets what?', ['A small isolated behavior','Only production traffic','An entire company','A UI color only'],0),
 ('A regression test helps prevent what?', ['Return of a previously fixed bug','All possible bugs','Network use','Build output'],0),
 ('What makes a deterministic test useful?', ['Stable results for the same inputs','Random results','No assertions','Only manual execution'],0),
 ('Why test boundaries?', ['Errors often occur at limits','Only to increase line count','To avoid assertions','To skip integration tests'],0)],
 'React':[
 ('Which hook manages local component state?', ['useState','useCSS','useHTTP','useClass'],0),
 ('What helps React identify items in a list?', ['Stable keys','Random colors','Global titles','Array length only'],0),
 ('State should usually be updated how?', ['Through state setters','By direct mutation','By editing the DOM only','By reloading the browser'],0),
 ('What are props?', ['Inputs passed to a component','Database passwords','CSS files only','Browser history'],0)]
}


def public_questions(skill):
    return [dict(id=i,prompt=q[0],options=q[1]) for i,q in enumerate(BANK[skill])]
