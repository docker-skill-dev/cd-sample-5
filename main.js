/*
 * Copyright © 2022 Atomist, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const skill = require("@atomist/skill");
const {Octokit} = require("@octokit/rest");

const TransactCommitSignature = async ctx => {
    const commit = ctx.event.context.subscription.result[0][0];
    const repo = commit["git.commit/repo"];
    const org = repo["git.repo/org"];

    const octokit = new Octokit(org["github.org/installation-token"] ?
        {auth: `token ${org["github.org/installation-token"]}`} : undefined);

    const gitCommit = (await octokit.repos.getCommit({
        owner: org["git.org/name"],
        repo: repo["git.repo/name"],
        ref: commit["git.commit/sha"],
    })).data;

    const entities = [
        {
            "schema/entity-type": skill.datalog.asKeyword("git/repo"),
            "schema/entity": "$repo",
            "git.repo/source-id": repo["git.repo/source-id"],
            "git.provider/url": org["git.provider/url"],
        },
        {
            "schema/entity-type": skill.datalog.asKeyword("git/commit"),
            "schema/entity": "$commit",
            "git.commit/repo": "$repo",
            "git.commit/sha": commit["git.commit/sha"],
            "git.provider/url": org["git.provider/url"],
        },
    ];
    const signatureEntity = {
        "schema/entity-type": skill.datalog.asKeyword("git.commit/signature"),
        "git.commit.signature/commit": "$commit",
        "git.commit.signature/status": gitCommit.commit.verification.verified
            ? skill.datalog.asKeyword("git.commit.signature/VERIFIED")
            : skill.datalog.asKeyword("git.commit.signature/NOT_VERIFIED"),
        "git.commit.signature/reason": gitCommit.commit.verification.reason,
    }
    if (gitCommit.commit.verification.signature) {
        signatureEntity["git.commit.signature/signature"] = gitCommit.commit.verification.signature;
    }
    entities.push(signatureEntity);

    await ctx.datalog.transact(entities);

    skill.log.info("Transacted commit signature for %s", commit["git.commit/sha"]);

    return {
        state: skill.State.Completed,
        reason: "Successfully transacted commit signature for 1 commit",
    };
};

const LogCommitSignature = async ctx => {
    const result = ctx.event.context.subscription.result[0];
    const commit = result[0];
    const signature = result[1];
    skill.log.info(
        "Commit %s is signed and verified by: %s",
        commit["git.commit/sha"],
        signature["git.commit.signature/signature"],
    );

    return {
        state: skill.State.Completed,
        reason: "Detected signed and verified commit",
    };
};

skill.start({
    on_push: TransactCommitSignature,
    on_commit_signature: LogCommitSignature,
}).then(_ => { });
