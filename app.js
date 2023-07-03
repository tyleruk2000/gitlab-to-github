import axios from 'axios';
import { Octokit } from '@octokit/core'
import log4js from 'log4js';
log4js.configure({
    appenders: { 
        file: { type: "file", filename: "app.log" },
        out: { type: "stdout" } },
    categories: { default: { appenders: ["file", "out"], level: "info" } },
  });

var logger = log4js.getLogger();


const URL = process.env.URL
const GITLABTOKEN = process.env.GITLABTOKEN
const GITHUBTOKEN = process.env.GITHUBTOKEN
const GITLABUSERNAME = process.env.GITLABUSERNAME
const GITLABPASSWORD = process.env.GITLABPASSWORD
const GITHUBOWNER = process.env.GITHUBOWNER

const octokit = new Octokit({
        auth: GITHUBTOKEN
    })

getGitLabRepos();

async function getGitLabRepos(){
    let page = 2;
    let emptyResponse = false
    let repos = []

    while (!emptyResponse) {
        const response = await getRepos(page);
        if (response.length == 0){
            emptyResponse=true;
        }
        for (let index = 0; index < response.length; index++) {
            repos.push(response[index]); //Add all repos to repos array
        }
        page++;
    }
    logger.info("Found: " + repos.length + " Git Lab projects")
    for (let index = 0; index < repos.length; index++) {
        const repo = repos[index];
        
        logger.info(`${index} of ${repos.length} name: ${repo.name}, project: ${repo.namespace.path} archived: ${repo.archived}`)
        
        const githubRepoName = repo.namespace.path + "-" + repo.path
        
        await createRepo(githubRepoName, repo);
        await sleep(1000)
        
        await migrateRepo(githubRepoName, repo);
        
        let status = await getImportStatus(githubRepoName)
        while (status.data.status != "complete"){
            await sleep(5000)
            status = await getImportStatus(githubRepoName)
            if (status.data.status == "error"){
                logger.info(status.data.message)
                break;
            }
            logger.info("Status: " + status.data.status)
        }
        
        await enableActions(githubRepoName)
        
        logger.info("-----------------------------")
    }
}

async function getRepos(page){
    const response = await axios.get(URL + '/api/v4/projects?&page='+page+'&per_page=50&private_token='+GITLABTOKEN)
        .catch(function (error) {
            logger.info("GITLAB ERROR:" + error);
        })
            .finally(function () {
        });
    return response.data
} 

async function findRepo(githubRepoName){
    try {
        const repo = await octokit.request('GET /repos/{owner}/{repo}', {
                owner: GITHUBOWNER,
                repo: githubRepoName,
                headers: {
                    'X-GitHub-Api-Version': '2022-11-28'
                }
            })
        disableActions(githubRepoName)
        return true
    } catch (error) {
        return false
    }
}

async function createRepo(githubRepoName, repo) {
    if (await findRepo(githubRepoName)){
        logger.info(`Repo ${githubRepoName} already exsists!`)
        return;
    }

    logger.info(`Creating repo ${githubRepoName}!`)
    const githubRepo = await octokit.request('POST /user/repos', {
        name: githubRepoName,
        description: repo.description,
        'private': true,
        headers: {
            'X-GitHub-Api-Version': '2022-11-28'
        }
    });
    disableActions(githubRepoName)
    return githubRepo;
}

async function disableActions(githubRepoName){
    logger.info("Disabiling actions for " + githubRepoName)
    await octokit.request('PUT /repos/{owner}/{repo}/actions/permissions', {
        owner: GITHUBOWNER,
        repo: githubRepoName,
        enabled: false,
        headers: {
          'X-GitHub-Api-Version': '2022-11-28'
        }
      })
}

async function enableActions(githubRepoName){
    logger.info("Enabiling actions for " + githubRepoName)
    await octokit.request('PUT /repos/{owner}/{repo}/actions/permissions', {
        owner: GITHUBOWNER,
        repo: githubRepoName,
        enabled: true,
        headers: {
          'X-GitHub-Api-Version': '2022-11-28'
        }
      })
}

async function migrateRepo(githubRepoName, repo) {
    try {
        const gitImportRsp = await octokit.request('PUT /repos/{owner}/{repo}/import', {
            owner: GITHUBOWNER,
            repo: githubRepoName,
            vcs: 'git',
            vcs_url: repo.http_url_to_repo,
            vcs_username: GITLABUSERNAME,
            vcs_password: GITLABPASSWORD,
            headers: {
                'X-GitHub-Api-Version': '2022-11-28'
            }
        });
        logger.info("Migration started for: " + githubRepoName)
    } catch (error) {
        logger.info("Migration already started or finished")
    }
}

async function getImportStatus(githubRepoName){
    const status = await octokit.request('GET /repos/{owner}/{repo}/import', {
        owner: GITHUBOWNER,
        repo: githubRepoName,
        headers: {
          'X-GitHub-Api-Version': '2022-11-28'
        }
      })   
    return status
}

function sleep(ms) {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }