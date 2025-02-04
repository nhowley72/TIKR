# How to Launch App 

cd my-react-app/backend   

uvicorn main:app --reload --host 127.0.0.1 --port 8000 --log-level debug

(if already in progress :)

lsof -i :8000

kill -9 (enter PID here)

uvicorn main:app --reload --host 127.0.0.1 --port 8000 --log-level debug

to get the nice preiction web page go to the bookmark projects/TICK Prediction 1: file:///Users/noel_personal/Repos/TIKR/my-react-app/backend/index.html

# Welcome to TIKR Repo! 

- The Purpose of this Repo is to enable some experience with a MLE pipeline and improve my skill with git and the front end development! 
- Scaling TIKR will be great experience but also bootstrapping the knowledge into the other personal projects would be great.

- Finally, all testing code before implementation will be made in the ML-Projects Repo under Stock_Project folder :D 

Enjoy! 

Noel


## Noel To do: Go to ML-Projects.
21/01/2025 
- Using render to host backend for free 
- made the front end slightly nicer with the bookmarked index.html (bookmarks -> projects/TIKR Prediction 1)

- Find out how TIKR can call from the prediction held locally/server side via api instead of running the model again. 
- Use DNN to do this and the models predictions stored in the models/ folder.

.