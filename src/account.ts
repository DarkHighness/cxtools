import axios, {AxiosInstance} from 'axios';
import axiosCookieJarSupport from "axios-cookiejar-support";
import tough from 'tough-cookie'
import { CronJob } from "cron";

interface AccountInfo {
    result: boolean;
    uid: number;
    uname: string;
    dxfid: number;
    phone: string;
    roleid: string;
    schoolid: number;
    cxid: number;
    email: string;
    isCertify: number;
    realname: string;
    status: string;
}

interface CourseInfo {
    courseId : string;
    classId : string;
    courseName : string;
}

interface SignTaskInfo {
    courseId : string;
    classId : string;
    taskId : string;
    courseName : string;
}

class Account {
    private session: AxiosInstance;

    private readonly header = {
        'Accept-Encoding': 'gzip, deflate',
        'Accept-Language': 'zh-CN,zh;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/80.0.3987.100 Safari/537.36'
    };

    private readonly username: string;
    private readonly password: string;
    private readonly schoolId: string;

    private accountInfo : AccountInfo | null;

    constructor(username: string, password: string, schoolId: string = "") {
        this.username = username.trim();
        this.password = password.trim();
        this.schoolId = schoolId.trim();

        this.session = Account.createAxiosInstance();
        this.accountInfo = null;
    }

    public async scheduleSignUp() : Promise<void>{
        console.log("轮询开始, 时间: ", new Date().toLocaleString());

        await this.signUp();

        console.log("本次轮询结束");

        let job = new CronJob(
            "0 */10 7-20 * * *",
            async () => {
                console.log("轮询开始, 时间: ", new Date().toLocaleString());

                await this.signUp();

                console.log("本次轮询结束");
            },
            null,
            false,
            "Asia/Chongqing"
        );

        job.start();
    }

    public async signUp() : Promise<number>{
        let loginStatus = await this.login();

        if(!loginStatus)
            return Promise.reject("Unable to login...");

        let courseInfos = await this.getAllClassId();

        for(const courseInfo of courseInfos){
            try{
                let activeSignTask = await this.getActiveSignTaskId(courseInfo);
                let signUpResult = await this.sign(activeSignTask);

                if(signUpResult != null){
                    console.log(`${courseInfo.courseName} : ${signUpResult[1]}`);
                }
            }
            catch (e) {
                console.warn(e);
            }
        }

        return Promise.resolve(0);
    }

    private static createAxiosInstance(): AxiosInstance {
        let instance = axios.create();
        axiosCookieJarSupport(instance);
        instance.defaults.jar = new tough.CookieJar();
        return instance;
    }

    private init() {
        this.session = Account.createAxiosInstance();
        this.accountInfo = null;
    }

    private async login(): Promise<boolean> {
        if(this.accountInfo != null)
            this.init();

        let response: AccountInfo;

        try {
            if (this.schoolId.length === 0)
                response = await this.loginByUsernameAndPassword();

            response = await this.loginByStudentIdAndPassword();

            this.accountInfo = response;

            console.log(`姓名:${this.accountInfo.realname}`);

            return Promise.resolve(true);
        } catch (e) {
            console.error(e);
            return Promise.resolve(false);
        }
    }

    private async loginByUsernameAndPassword(): Promise<AccountInfo> {
        let response = await this.session.post(`http://i.chaoxing.com/vlogin?passWord=${this.password}&userName=${this.username}`, {}, {
            headers: this.header
        });

        if (response.status == 200)
            return Promise.resolve(response.data);
        return Promise.reject(response.statusText);
    }

    private async loginByStudentIdAndPassword(): Promise<AccountInfo> {
        let response = await this.session.post(`http://passport2.chaoxing.com/api/login?name=${this.username}&pwd=${this.password}&schoolid=${this.schoolId}&verify=0`);

        if (response.status == 200)
            return Promise.resolve(response.data);
        return Promise.reject(response.statusText);
    }

    private async getAllClassId() : Promise<Array<CourseInfo>>{
        let regex = new RegExp("<li style=\"position:relative\">[\\s]*<input type=\"hidden\" name=\"courseId\" value=\"(.*)\" />[\\s].*<input type=\"hidden\" name=\"classId\" value=\"(.*)\" />[\\s].*[\\s].*[\\s].*[\\s].*[\\s].*[\\s].*[\\s].*[\\s].*[s].*[\\s]*[\\s].*[\\s].*[\\s].*[\\s].*[\\s].*<a  href=\\'.*\\' target=\"_blank\" title=\".*\">(.*)</a>","g");

        let response = await this.session.get("http://mooc1-2.chaoxing.com/visit/interaction", {
            headers: this.header,
            withCredentials: true
        });

        let text = response.data as string;
        let matched;
        let result : Array<CourseInfo> = [];

        while ((matched = regex.exec(text)) != null){
            result.push({
               courseId: matched[1],
               classId: matched[2],
               courseName: matched[3]
            });
        }

        return Promise.resolve(result);
    }

    private async getActiveSignTaskId(courseInfo : CourseInfo) : Promise<SignTaskInfo>{
        let regex = new RegExp("<div class=\"Mct\" onclick=\"activeDetail\\((.*),2,null\\)\">[\\s].*[\\s].*[\\s].*[\\s].*<dd class=\"green\">.*</dd>","g");

        let response = await this.session.get(`https://mobilelearn.chaoxing.com/widget/pcpick/stu/index?courseId=${courseInfo.courseId}&jclassId=${courseInfo.classId}`, {
            headers: this.header,
            withCredentials: true
        });

        let text = response.data as string;
        let matched = regex.exec(text);

        if(matched == null)
            return Promise.reject(`No Sign Task: ${courseInfo.courseName}`);

        return Promise.resolve({
            courseId : courseInfo.courseId,
            courseName : courseInfo.courseName,
            classId : courseInfo.classId,
            taskId : matched[1]
        })
    }

    private async sign(signTaskInfo : SignTaskInfo) : Promise<RegExpExecArray | null>{
        let response = await this.session.get(`https://mobilelearn.chaoxing.com/widget/sign/pcStuSignController/preSign?activeId=${signTaskInfo.taskId}&classId=${signTaskInfo.classId}&fid=39037&courseId=${signTaskInfo.courseId}`,
            {
                headers: this.header,
                withCredentials: true
            });

        let text = response.data as string;

        let regex = new RegExp("<title>(.*)</title>", "g");

        return Promise.resolve(regex.exec(text));
    }
}

export { Account, AccountInfo };